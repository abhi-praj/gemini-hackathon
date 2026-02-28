"""
SocialGraph — tracks relationships between agents.

Relationships are created/updated when agents interact (talk_to_agent),
and relationship context is injected into agent prompts.
Persists to JSON on disk.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class Relationship:
    agent_a: str
    agent_b: str
    relation_type: str = "acquaintance"
    strength: float = 0.1
    notes: str = ""
    last_interaction: float = 0.0
    interaction_count: int = 0
    shared_memories: list[str] = field(default_factory=list)


class SocialGraph:
    """Manages the social graph of agent relationships."""

    MAX_SHARED_MEMORIES = 10

    def __init__(self, persist_dir: Optional[str] = None):
        self._persist_dir = Path(persist_dir or settings.social_graph_persist_dir)
        self._relationships: dict[tuple[str, str], Relationship] = {}
        self._load()

    @staticmethod
    def _canonical_key(a: str, b: str) -> tuple[str, str]:
        """Return a sorted canonical key for a pair of agents."""
        return (min(a, b), max(a, b))

    def add_relationship(
        self,
        a: str,
        b: str,
        relation_type: str = "acquaintance",
        strength: float = 0.1,
        notes: str = "",
    ) -> Relationship:
        """Create or update a relationship between two agents."""
        key = self._canonical_key(a, b)
        if key in self._relationships:
            rel = self._relationships[key]
            rel.relation_type = relation_type
            rel.strength = min(1.0, max(0.0, strength))
            if notes:
                rel.notes = notes
            return rel

        rel = Relationship(
            agent_a=key[0],
            agent_b=key[1],
            relation_type=relation_type,
            strength=min(1.0, max(0.0, strength)),
            notes=notes,
            last_interaction=time.time(),
        )
        self._relationships[key] = rel
        return rel

    def update_interaction(self, a: str, b: str, context: str = "") -> None:
        """Record an interaction between two agents."""
        key = self._canonical_key(a, b)
        if key not in self._relationships:
            self.add_relationship(a, b)

        rel = self._relationships[key]
        rel.interaction_count += 1
        rel.last_interaction = time.time()
        # Bump strength: starts at 0.1, increases with diminishing returns
        rel.strength = min(1.0, rel.strength + 0.05 * (1.0 - rel.strength))

        # Update relation type based on strength
        if rel.strength >= 0.7:
            rel.relation_type = "close_friend"
        elif rel.strength >= 0.4:
            rel.relation_type = "friend"
        elif rel.strength >= 0.2:
            rel.relation_type = "acquaintance"

        if context:
            rel.shared_memories.append(context[:200])
            # Keep only the most recent shared memories
            rel.shared_memories = rel.shared_memories[-self.MAX_SHARED_MEMORIES:]

        logger.debug(
            "Updated interaction %s <-> %s (count=%d, strength=%.2f)",
            a, b, rel.interaction_count, rel.strength,
        )

    def get_relationships(self, agent_id: str) -> list[Relationship]:
        """Get all relationships for an agent."""
        return [
            rel for key, rel in self._relationships.items()
            if agent_id in key
        ]

    def get_relationship(self, a: str, b: str) -> Optional[Relationship]:
        """Get the relationship between two specific agents."""
        key = self._canonical_key(a, b)
        return self._relationships.get(key)

    def format_for_prompt(self, agent_id: str) -> str:
        """Format relationships as prompt context for an agent."""
        rels = self.get_relationships(agent_id)
        if not rels:
            return ""

        lines = ["\n[RELATIONSHIPS] People you know:"]
        for rel in rels:
            other = rel.agent_b if rel.agent_a == agent_id else rel.agent_a
            strength_desc = "barely know" if rel.strength < 0.2 else \
                           "somewhat know" if rel.strength < 0.4 else \
                           "know well" if rel.strength < 0.7 else \
                           "are close with"
            line = f"  - {other} ({rel.relation_type}): You {strength_desc} them."
            if rel.notes:
                line += f" {rel.notes}"
            if rel.shared_memories:
                line += f" Last interaction: {rel.shared_memories[-1]}"
            lines.append(line)

        return "\n".join(lines)

    def persist(self) -> None:
        """Save the social graph to disk."""
        self._persist_dir.mkdir(parents=True, exist_ok=True)
        filepath = self._persist_dir / "relationships.json"

        data = []
        for rel in self._relationships.values():
            data.append(asdict(rel))

        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

        logger.info("Social graph persisted (%d relationships)", len(data))

    def _load(self) -> None:
        """Load the social graph from disk."""
        filepath = self._persist_dir / "relationships.json"
        if not filepath.exists():
            return

        try:
            with open(filepath) as f:
                data = json.load(f)

            for item in data:
                rel = Relationship(**item)
                key = self._canonical_key(rel.agent_a, rel.agent_b)
                self._relationships[key] = rel

            logger.info("Loaded social graph (%d relationships)", len(self._relationships))
        except Exception as e:
            logger.warning("Failed to load social graph: %s", e)
