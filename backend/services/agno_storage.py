"""
Agno agent storage backed by SQLite for persistent persona memory.

The SQLite database is stored at the path defined by AGNO_DB_URL
(default: sqlite:///data/agno_memory.db), which is mounted as a
Docker volume so agent memory survives container restarts.
"""

import os
from agno.agent import Agent
from agno.models.google import Gemini
from agno.storage.sqlite import SqliteStorage

AGNO_DB_URL = os.getenv("AGNO_DB_URL", "sqlite:///data/agno_memory.db")
# Extract the file path from the SQLite URL (strip "sqlite:///")
_db_path = AGNO_DB_URL.replace("sqlite:///", "")

storage = SqliteStorage(db_file=_db_path, table_name="agent_sessions")

# Default model: Gemini 2.0 Flash (uses GEMINI_API_KEY from env)
default_model = Gemini(id="gemini-2.0-flash")


def create_agent(agent_id: str, description: str, instructions: list[str], model=None) -> Agent:
    """Create an Agno agent with persistent SQLite-backed memory.

    Args:
        agent_id: Unique identifier for the agent.
        description: The agent's persona / backstory.
        instructions: Behavioral rules the agent must follow.
        model: The LLM model instance to use. Defaults to Gemini 2.0 Flash.

    Returns:
        An Agno Agent with session storage wired to SQLite.
    """
    agent = Agent(
        agent_id=agent_id,
        model=model or default_model,
        description=description,
        instructions=instructions,
        storage=storage,
        add_history_to_messages=True,
        num_history_responses=5,
    )
    return agent
