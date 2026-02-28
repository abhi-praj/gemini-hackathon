"""
AgentManager — central orchestrator for Agno-powered world agents.

Handles agent lifecycle: creation, chat, inner-voice commands,
autonomous ticks, and agent-to-agent Team conversations.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

from agno.agent import Agent
from agno.team import Team, TeamMode

from models.state import AgentState, WorldState
from services.agno_storage import create_agent
from services.world_tools import WorldTools

if TYPE_CHECKING:
    from services.memory_store import MemoryStore

logger = logging.getLogger(__name__)


class AgentManager:
    """Manages Agno agents and their interaction with the world."""

    def __init__(
        self, world_state: WorldState, memory_store: Optional[MemoryStore] = None
    ):
        self.world_state = world_state
        self.memory_store = memory_store
        self.agents: dict[str, Agent] = {}

    def initialize_agents(self) -> None:
        """Create an Agno agent for every agent in the world state."""
        # Initialize memory indexes if a store is available
        if self.memory_store is not None:
            agent_ids = [a.id for a in self.world_state.agents]
            self.memory_store.initialize(agent_ids)

        for agent_state in self.world_state.agents:
            tools = WorldTools(
                agent_id=agent_state.id,
                world_state=self.world_state,
                memory_store=self.memory_store,
            )
            agent = create_agent(
                agent_id=agent_state.id,
                name=agent_state.name,
                description=agent_state.description,
                instructions=agent_state.instructions,
                role=agent_state.role,
                tools=[tools],
            )
            self.agents[agent_state.id] = agent
            logger.info("Initialized agent: %s (%s)", agent_state.name, agent_state.id)

        logger.info("All %d agents initialized.", len(self.agents))

    # ------------------------------------------------------------------
    # Memory helpers
    # ------------------------------------------------------------------

    def _build_memory_context(
        self, agent_id: str, situation: str, top_k: int = 5
    ) -> str:
        """Retrieve relevant memories and format them as prompt context."""
        if self.memory_store is None:
            return ""

        memories = self.memory_store.retrieve(agent_id, situation, top_k=top_k)
        if not memories:
            return ""

        lines = ["\n[MEMORIES] Relevant past experiences:"]
        for text, _score in memories:
            lines.append(f"  - {text}")
        lines.append("Use these to inform your response if relevant.")
        return "\n".join(lines)

    def _record_response(self, agent_id: str, text: str, category: str) -> None:
        """Record an agent's response as a memory."""
        if self.memory_store is not None and text:
            self.memory_store.add_memory(
                agent_id, text, metadata={"category": category}
            )

    # ------------------------------------------------------------------
    # Chat — user talks to an agent
    # ------------------------------------------------------------------

    async def chat(self, agent_id: str, message: str) -> str:
        """Handle a user talking to an agent.

        The message is framed as a visitor approaching the agent so the
        agent stays in character.
        """
        agent = self.agents.get(agent_id)
        if not agent:
            return f"Agent '{agent_id}' not found."

        agent_state = self._get_agent_state(agent_id)
        name = agent_state.name if agent_state else agent_id

        memory_context = self._build_memory_context(agent_id, message)

        prompt = (
            f"A visitor approaches you and says: \"{message}\"\n"
            f"Respond in character as {name}. "
            "You may use your tools if the conversation requires an action."
            f"{memory_context}"
        )

        result = await agent.arun(prompt)
        content = result.content if result and result.content else "(no response)"
        self._record_response(agent_id, f"Visitor said: \"{message}\". I responded: {content}", "agent_response")
        return content

    # ------------------------------------------------------------------
    # Inner voice — user commands an agent as a guiding voice
    # ------------------------------------------------------------------

    async def inner_voice(self, agent_id: str, command: str) -> str:
        """Send an inner-voice directive to an agent.

        The agent interprets this as an internal thought / compulsion
        and uses its tools to carry it out.
        """
        agent = self.agents.get(agent_id)
        if not agent:
            return f"Agent '{agent_id}' not found."

        memory_context = self._build_memory_context(agent_id, command)

        prompt = (
            f"[INNER VOICE] You feel a strong urge: {command}\n"
            "Act on this urge using the tools available to you. "
            "Narrate what you do briefly."
            f"{memory_context}"
        )

        result = await agent.arun(prompt)
        content = result.content if result and result.content else "(no response)"
        self._record_response(agent_id, f"Inner voice urged: \"{command}\". I did: {content}", "agent_response")
        return content

    # ------------------------------------------------------------------
    # Tick — autonomous decision-making
    # ------------------------------------------------------------------

    async def tick_agent(self, agent_id: str) -> dict:
        """Trigger one autonomous decision cycle for an agent.

        Returns a dict with agent_id, action, success, and detail.
        """
        agent = self.agents.get(agent_id)
        if not agent:
            return {
                "agent_id": agent_id,
                "action": "error",
                "success": False,
                "detail": f"Agent '{agent_id}' not found.",
            }

        agent_state = self._get_agent_state(agent_id)
        location = ""
        if agent_state:
            location = agent_state.location_id

        situation = f"I am at '{location}'. What should I do next?"
        memory_context = self._build_memory_context(agent_id, situation)

        prompt = (
            "It is a new moment in your day. "
            f"You are currently at '{location}'. "
            "Decide what to do next. You can move, talk to someone nearby, "
            "interact with an object, or simply observe your surroundings. "
            "Use exactly one tool to take an action, then briefly narrate what you did."
            f"{memory_context}"
        )

        try:
            result = await agent.arun(prompt)
            content = result.content if result and result.content else ""
            action = agent_state.current_action if agent_state else "unknown"
            self._record_response(agent_id, f"Tick at {location}: {content}", "agent_response")
            return {
                "agent_id": agent_id,
                "action": action,
                "success": True,
                "detail": content,
            }
        except Exception as e:
            logger.exception("Tick failed for %s", agent_id)
            return {
                "agent_id": agent_id,
                "action": "error",
                "success": False,
                "detail": str(e),
            }

    async def tick_all(self) -> list[dict]:
        """Tick all agents concurrently."""
        tasks = [self.tick_agent(aid) for aid in self.agents]
        return await asyncio.gather(*tasks)

    # ------------------------------------------------------------------
    # Team — agent-to-agent conversation
    # ------------------------------------------------------------------

    def create_conversation_team(self, agent_ids: list[str]) -> Optional[Team]:
        """Create an Agno Team in coordinate mode for multi-agent conversation."""
        members = [self.agents[aid] for aid in agent_ids if aid in self.agents]
        if len(members) < 2:
            return None

        team = Team(
            name="conversation",
            mode=TeamMode.coordinate,
            members=members,
            instructions=[
                "You are coordinating a conversation between the team members.",
                "Each member should respond in character.",
                "Keep the conversation natural and brief.",
            ],
        )
        return team

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_agent_state(self, agent_id: str) -> Optional[AgentState]:
        for agent in self.world_state.agents:
            if agent.id == agent_id:
                return agent
        return None
