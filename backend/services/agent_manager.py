"""
AgentManager — central orchestrator for Agno-powered world agents.

Handles agent lifecycle: creation, chat, inner-voice commands,
autonomous ticks (plan-aware), reflection, social graph, and
agent-to-agent Team conversations.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

from agno.agent import Agent
from agno.team import Team, TeamMode

from models.state import AgentState, WorldState
from services.agno_storage import create_agent
from services.observability import trace_agent_action
from services.planner import Planner
from services.world_tools import WorldTools

if TYPE_CHECKING:
    from services.memory_store import MemoryStore
    from services.reflection import ReflectionEngine
    from services.social_graph import SocialGraph

logger = logging.getLogger(__name__)


class AgentManager:
    """Manages Agno agents and their interaction with the world."""

    def __init__(
        self,
        world_state: WorldState,
        memory_store: Optional[MemoryStore] = None,
        social_graph: Optional[SocialGraph] = None,
        reflection_engine: Optional[ReflectionEngine] = None,
    ):
        self.world_state = world_state
        self.memory_store = memory_store
        self.social_graph = social_graph
        self.reflection_engine = reflection_engine
        self.planner = Planner(memory_store=memory_store)
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
                social_graph=self.social_graph,
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
        parts: list[str] = []

        if self.memory_store is not None:
            memories = self.memory_store.retrieve(agent_id, situation, top_k=top_k)
            if memories:
                lines = ["\n[MEMORIES] Relevant past experiences:"]
                for text, _score in memories:
                    lines.append(f"  - {text}")
                lines.append("Use these to inform your response if relevant.")
                parts.append("\n".join(lines))

        if self.social_graph is not None:
            social_context = self.social_graph.format_for_prompt(agent_id)
            if social_context:
                parts.append(social_context)

        return "\n".join(parts)

    def _record_response(self, agent_id: str, text: str, category: str) -> None:
        """Record an agent's response as a memory and trigger reflection check."""
        if self.memory_store is None or not text:
            return

        importance = self.memory_store.add_memory(
            agent_id, text, metadata={"category": category}
        )

        # Accumulate importance for reflection
        if self.reflection_engine is not None:
            self.reflection_engine.accumulate_importance(agent_id, importance)
            if self.reflection_engine.check_threshold(agent_id):
                # Fire-and-forget reflection generation
                asyncio.ensure_future(self._run_reflection(agent_id))

    async def _run_reflection(self, agent_id: str) -> None:
        """Run reflection generation in the background."""
        if self.reflection_engine is None:
            return
        agent_state = self._get_agent_state(agent_id)
        name = agent_state.name if agent_state else agent_id
        try:
            reflections = self.reflection_engine.generate_reflections(agent_id, name)
            logger.info("Generated %d reflections for %s", len(reflections), agent_id)
        except Exception as e:
            logger.warning("Reflection failed for %s: %s", agent_id, e)

    # ------------------------------------------------------------------
    # Planning helpers
    # ------------------------------------------------------------------

    def _ensure_plan(self, agent_state: AgentState) -> None:
        """Generate a plan if the agent doesn't have one or has exhausted it."""
        needs_plan = (
            agent_state.daily_plan is None
            or agent_state.current_plan_step >= len(agent_state.daily_plan)
        )
        if not needs_plan:
            return

        steps = self.planner.generate_plan(
            agent_id=agent_state.id,
            name=agent_state.name,
            persona=agent_state.description,
            location=agent_state.location_id,
        )
        agent_state.daily_plan = steps
        agent_state.current_plan_step = 0

        # Record the plan as a memory
        plan_text = f"My plan for today: {'; '.join(steps)}"
        if self.memory_store is not None:
            self.memory_store.add_memory(
                agent_state.id, plan_text, metadata={"category": "plan"}
            )
        logger.info("Generated plan for %s: %s", agent_state.id, steps)

    def get_agent_plan(self, agent_id: str) -> Optional[dict]:
        """Return the current plan for an agent."""
        agent_state = self._get_agent_state(agent_id)
        if agent_state is None:
            return None
        return {
            "agent_id": agent_id,
            "daily_plan": agent_state.daily_plan or [],
            "current_step": agent_state.current_plan_step,
            "day_number": agent_state.day_number,
        }

    def regenerate_plan(self, agent_id: str) -> Optional[dict]:
        """Force regenerate a plan for an agent."""
        agent_state = self._get_agent_state(agent_id)
        if agent_state is None:
            return None
        agent_state.daily_plan = None
        self._ensure_plan(agent_state)
        return self.get_agent_plan(agent_id)

    # ------------------------------------------------------------------
    # Chat — user talks to an agent
    # ------------------------------------------------------------------

    @trace_agent_action("chat")
    async def chat(self, agent_id: str, message: str) -> str:
        """Handle a user talking to an agent."""
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

    @trace_agent_action("inner_voice")
    async def inner_voice(self, agent_id: str, command: str) -> str:
        """Send an inner-voice directive to an agent."""
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
    # Tick — autonomous decision-making (plan-aware)
    # ------------------------------------------------------------------

    @trace_agent_action("tick_agent")
    async def tick_agent(self, agent_id: str) -> dict:
        """Trigger one autonomous decision cycle for an agent.

        Uses the planning system: ensures a plan exists, includes the
        current step in the prompt, and advances the step when completed.
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
            self._ensure_plan(agent_state)

        # Build plan context
        plan_context = ""
        if agent_state and agent_state.daily_plan:
            step_idx = agent_state.current_plan_step
            if step_idx < len(agent_state.daily_plan):
                current_step = agent_state.daily_plan[step_idx]
                plan_context = (
                    f"\n[PLAN] Your current plan step ({step_idx + 1}/{len(agent_state.daily_plan)}): "
                    f"{current_step}\n"
                    "Follow this plan step, or react to something more urgent if needed. "
                    "If you complete this step, include PLAN_STEP_COMPLETE in your response."
                )

        situation = f"I am at '{location}'. What should I do next?"
        memory_context = self._build_memory_context(agent_id, situation)

        prompt = (
            "It is a new moment in your day. "
            f"You are currently at '{location}'. "
            "Decide what to do next. You can move, talk to someone nearby, "
            "interact with an object, or simply observe your surroundings. "
            "Use exactly one tool to take an action, then briefly narrate what you did."
            f"{plan_context}"
            f"{memory_context}"
        )

        try:
            result = await agent.arun(prompt)
            content = result.content if result and result.content else ""
            action = agent_state.current_action if agent_state else "unknown"

            # Advance plan step if completed
            if agent_state and "PLAN_STEP_COMPLETE" in content:
                agent_state.current_plan_step += 1
                content = content.replace("PLAN_STEP_COMPLETE", "").strip()

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
