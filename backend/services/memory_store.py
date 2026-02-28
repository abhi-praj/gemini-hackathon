"""
MemoryStore — LlamaIndex-backed semantic memory for agents.

Each agent gets its own VectorStoreIndex so memories are isolated.
Embeddings are generated via Google's text-embedding-004 model.
Indexes persist to disk as JSON (SimpleVectorStore) and reload on restart.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Optional

from llama_index.core import StorageContext, VectorStoreIndex, load_index_from_storage
from llama_index.core.schema import TextNode
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding

from core.config import settings

logger = logging.getLogger(__name__)

# Shared embedding model instance (stateless, safe to share)
_embed_model: Optional[GoogleGenAIEmbedding] = None


def _get_embed_model() -> GoogleGenAIEmbedding:
    global _embed_model
    if _embed_model is None:
        _embed_model = GoogleGenAIEmbedding(
            model_name="text-embedding-004",
            api_key=settings.gemini_api_key,
        )
    return _embed_model


class AgentMemoryIndex:
    """Wraps a single agent's VectorStoreIndex."""

    def __init__(self, agent_id: str, persist_dir: Path):
        self.agent_id = agent_id
        self.persist_dir = persist_dir
        self._insert_count = 0

        embed_model = _get_embed_model()

        if (persist_dir / "docstore.json").exists():
            logger.info("Loading existing memory index for %s", agent_id)
            storage_context = StorageContext.from_defaults(persist_dir=str(persist_dir))
            self.index = load_index_from_storage(
                storage_context, embed_model=embed_model
            )
        else:
            logger.info("Creating new memory index for %s", agent_id)
            persist_dir.mkdir(parents=True, exist_ok=True)
            self.index = VectorStoreIndex([], embed_model=embed_model)

    def add_memory(self, text: str, metadata: Optional[dict] = None) -> None:
        """Insert a memory into this agent's index."""
        node_metadata = {
            "agent_id": self.agent_id,
            "timestamp": time.time(),
        }
        if metadata:
            node_metadata.update(metadata)

        node = TextNode(text=text, metadata=node_metadata)
        self.index.insert_nodes([node])
        self._insert_count += 1

    def retrieve(self, query: str, top_k: int = 5) -> list[tuple[str, float]]:
        """Return the top-K most relevant memories as (text, score) tuples."""
        retriever = self.index.as_retriever(similarity_top_k=top_k)
        results = retriever.retrieve(query)
        return [(node.get_text(), node.get_score()) for node in results]

    def persist(self) -> None:
        """Save the index to disk."""
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.index.storage_context.persist(persist_dir=str(self.persist_dir))


class MemoryStore:
    """Manages all agents' memory indexes."""

    AUTO_PERSIST_INTERVAL = 50  # persist every N inserts per agent

    def __init__(self, persist_base: Optional[str] = None):
        self._persist_base = Path(persist_base or settings.memory_persist_dir)
        self._indexes: dict[str, AgentMemoryIndex] = {}

    def initialize(self, agent_ids: list[str]) -> None:
        """Load or create memory indexes for the given agent IDs."""
        for agent_id in agent_ids:
            persist_dir = self._persist_base / agent_id
            self._indexes[agent_id] = AgentMemoryIndex(agent_id, persist_dir)
        logger.info("Memory store initialized for %d agents", len(agent_ids))

    def add_memory(
        self, agent_id: str, text: str, metadata: Optional[dict] = None
    ) -> None:
        """Add a memory for an agent. Auto-persists periodically."""
        idx = self._indexes.get(agent_id)
        if idx is None:
            logger.warning("No memory index for agent %s — skipping", agent_id)
            return

        idx.add_memory(text, metadata)

        if idx._insert_count % self.AUTO_PERSIST_INTERVAL == 0:
            idx.persist()
            logger.debug("Auto-persisted memory index for %s", agent_id)

    def retrieve(
        self, agent_id: str, query: str, top_k: int = 5
    ) -> list[tuple[str, float]]:
        """Retrieve top-K memories for an agent."""
        idx = self._indexes.get(agent_id)
        if idx is None:
            return []
        return idx.retrieve(query, top_k)

    def persist_all(self) -> None:
        """Persist all agent indexes to disk."""
        for agent_id, idx in self._indexes.items():
            idx.persist()
            logger.info("Persisted memory index for %s", agent_id)
