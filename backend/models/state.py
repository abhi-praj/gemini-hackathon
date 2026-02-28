from pydantic import BaseModel
from typing import List, Optional

class EnvironmentNode(BaseModel):
    id: str
    name: str
    description: str
    children: List["EnvironmentNode"] = []

# Resolve forward references
EnvironmentNode.model_rebuild()

class AgentState(BaseModel):
    id: str
    name: str
    location_id: str
    current_action: str

class WorldState(BaseModel):
    environment_root: EnvironmentNode
    agents: List[AgentState]
