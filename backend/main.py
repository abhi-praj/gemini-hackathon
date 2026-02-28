import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.config import settings
from models.state import WorldState
from models.api_models import (
    ChatRequest,
    ChatResponse,
    InnerVoiceRequest,
    InnerVoiceResponse,
    TickRequest,
    TickResponse,
    TickResult,
)
from services.agent_manager import AgentManager
from services.map_generator import MapGenerator
from services.memory_store import MemoryStore
from services.observability import init_langfuse, flush_langfuse
from services.reflection import ReflectionEngine
from services.social_graph import SocialGraph

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"


def load_json(filename: str) -> dict:
    with open(DATA_DIR / filename) as f:
        return json.load(f)


# Load seed world and asset registry
world_state = WorldState(**load_json("seed_world.json"))
asset_registry = load_json("asset_registry.json")

# ---------------------------------------------------------------------------
# Temporal — imported through the decoupled package API.
# If temporalio is not installed, simulation endpoints degrade gracefully.
# ---------------------------------------------------------------------------

_temporal_available = True

try:
    from temporal import (
        AgentInfo,
        SimulationInput,
        WorldSimulationWorkflow,
    )
    from temporal.client import configure as configure_temporal, get_client, close_client
except ImportError:
    _temporal_available = False
    logger.warning("temporalio SDK not installed — simulation endpoints disabled.")

# Core services — initialized during startup
memory_store = MemoryStore()
social_graph = SocialGraph()
reflection_engine = ReflectionEngine(memory_store=memory_store)
map_generator = MapGenerator(asset_registry)
agent_manager = AgentManager(
    world_state,
    memory_store=memory_store,
    social_graph=social_graph,
    reflection_engine=reflection_engine,
)

# WebSocket connections for broadcasting
_ws_connections: list[WebSocket] = []

# ---------------------------------------------------------------------------
# FastAPI lifespan
# ---------------------------------------------------------------------------

SIMULATION_WORKFLOW_ID = "world-simulation"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    # Initialize observability
    init_langfuse()

    # Initialize Agno agents
    agent_manager.initialize_agents()
    logger.info("Agent manager ready with %d agents", len(agent_manager.agents))

    if _temporal_available:
        # Configure the temporal client (host/namespace come from app config)
        configure_temporal(
            host=settings.temporal_host,
            namespace=settings.temporal_namespace,
        )
        try:
            from providers import bootstrap_providers
            bootstrap_providers(memory_store=memory_store)

            client = await get_client()
            logger.info(
                "Connected to Temporal at %s (namespace=%s)",
                settings.temporal_host,
                settings.temporal_namespace,
            )
        except Exception as e:
            logger.warning(
                "Could not connect to Temporal: %s — simulation endpoints will fail.", e
            )
    yield
    # Persist all state before shutting down
    memory_store.persist_all()
    logger.info("Memory store persisted on shutdown.")
    social_graph.persist()
    logger.info("Social graph persisted on shutdown.")
    flush_langfuse()
    if _temporal_available:
        await close_client()


app = FastAPI(title=settings.project_name, lifespan=lifespan)

# Add CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helper: broadcast state to all connected WebSocket clients
# ---------------------------------------------------------------------------

async def _broadcast_state():
    """Send current world state to all connected WebSocket clients."""
    payload = json.dumps({
        "action": "state_update",
        "state": world_state.model_dump(),
    })
    dead: list[WebSocket] = []
    for ws in _ws_connections:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_connections.remove(ws)


# ---------------------------------------------------------------------------
# Existing endpoints
# ---------------------------------------------------------------------------


@app.get("/")
def read_root():
    return {"message": "Welcome to the Generative AI World Server"}


@app.get("/state", response_model=WorldState)
def get_state():
    return world_state


@app.get("/assets")
def get_assets():
    """Serve the asset registry so the frontend knows how to render tile_keys."""
    return asset_registry


# ------------------------------------------------------------------
# Agent endpoints
# ------------------------------------------------------------------


@app.post("/agent/chat", response_model=ChatResponse)
async def agent_chat(req: ChatRequest):
    """User talks to an agent."""
    reply = await agent_manager.chat(req.agent_id, req.message)
    return ChatResponse(agent_id=req.agent_id, reply=reply)


@app.post("/agent/inner-voice", response_model=InnerVoiceResponse)
async def agent_inner_voice(req: InnerVoiceRequest):
    """Send an inner-voice directive to an agent."""
    result = await agent_manager.inner_voice(req.agent_id, req.command)
    return InnerVoiceResponse(agent_id=req.agent_id, result=result)


@app.post("/agent/tick", response_model=TickResponse)
async def agent_tick(req: TickRequest):
    """Trigger agent(s) to decide their next autonomous action."""
    if req.agent_id:
        raw = await agent_manager.tick_agent(req.agent_id)
        results = [raw]
    else:
        results = await agent_manager.tick_all()

    # Broadcast updated state to all WebSocket clients
    await _broadcast_state()

    return TickResponse(
        results=[
            TickResult(
                agent_id=r["agent_id"],
                action=r["action"],
                success=r["success"],
                detail=r.get("detail", ""),
            )
            for r in results
        ]
    )


# ------------------------------------------------------------------
# Plan endpoints
# ------------------------------------------------------------------


@app.get("/agent/{agent_id}/plan")
def get_agent_plan(agent_id: str):
    """Get the current plan for an agent."""
    plan = agent_manager.get_agent_plan(agent_id)
    if plan is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found.")
    return plan


@app.post("/agent/{agent_id}/plan/regenerate")
def regenerate_agent_plan(agent_id: str):
    """Force regenerate a plan for an agent."""
    plan = agent_manager.regenerate_plan(agent_id)
    if plan is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found.")
    return plan


# ------------------------------------------------------------------
# Social graph endpoints
# ------------------------------------------------------------------


@app.get("/agent/{agent_id}/relationships")
def get_agent_relationships(agent_id: str):
    """Get all relationships for an agent."""
    from dataclasses import asdict
    rels = social_graph.get_relationships(agent_id)
    return {"agent_id": agent_id, "relationships": [asdict(r) for r in rels]}


# ------------------------------------------------------------------
# Map expansion endpoints
# ------------------------------------------------------------------


class ExpandRequest(BaseModel):
    direction: str
    trigger_x: int = 0
    trigger_y: int = 0


@app.post("/world/expand")
async def expand_world(req: ExpandRequest):
    """Procedurally expand the world in a direction."""
    new_node = map_generator.expand(
        world_state, req.direction, req.trigger_x, req.trigger_y
    )
    if new_node is None:
        raise HTTPException(status_code=400, detail="Map expansion failed.")

    # Broadcast updated state
    await _broadcast_state()

    return {
        "success": True,
        "new_zone": new_node.model_dump(),
        "expansion_count": world_state.expansion_count,
    }


# ------------------------------------------------------------------
# WebSocket — structured JSON routing
# ------------------------------------------------------------------


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _ws_connections.append(websocket)
    try:
        # Send initial state
        await websocket.send_json({
            "action": "state_update",
            "state": world_state.model_dump(),
        })

        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            action = data.get("action")

            if action == "chat":
                agent_id = data.get("agent_id", "")
                message = data.get("message", "")
                reply = await agent_manager.chat(agent_id, message)
                await websocket.send_json({
                    "action": "chat",
                    "agent_id": agent_id,
                    "reply": reply,
                })

            elif action == "tick":
                agent_id = data.get("agent_id")
                if agent_id:
                    raw_result = await agent_manager.tick_agent(agent_id)
                    results = [raw_result]
                else:
                    results = await agent_manager.tick_all()
                await websocket.send_json({
                    "action": "tick",
                    "results": results,
                })
                # Broadcast state update to all clients
                await _broadcast_state()

            elif action == "inner_voice":
                agent_id = data.get("agent_id", "")
                command = data.get("command", "")
                result = await agent_manager.inner_voice(agent_id, command)
                await websocket.send_json({
                    "action": "inner_voice",
                    "agent_id": agent_id,
                    "result": result,
                })

            elif action == "get_state":
                await websocket.send_json({
                    "action": "state_update",
                    "state": world_state.model_dump(),
                })

            elif action == "expand":
                direction = data.get("direction", "")
                trigger_x = data.get("trigger_x", 0)
                trigger_y = data.get("trigger_y", 0)
                new_node = map_generator.expand(
                    world_state, direction, trigger_x, trigger_y
                )
                if new_node:
                    await _broadcast_state()
                    await websocket.send_json({
                        "action": "expand",
                        "success": True,
                        "new_zone": new_node.model_dump(),
                    })
                else:
                    await websocket.send_json({
                        "action": "expand",
                        "success": False,
                    })

            else:
                await websocket.send_json({
                    "error": f"Unknown action: {action}",
                    "hint": "Valid actions: chat, tick, inner_voice, get_state, expand",
                })

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)


# ---------------------------------------------------------------------------
# Simulation endpoints (Temporal-powered)
# ---------------------------------------------------------------------------


def _require_temporal():
    if not _temporal_available:
        raise HTTPException(
            status_code=503,
            detail="Temporal SDK not available. Install temporalio and restart.",
        )


class StartSimulationRequest(BaseModel):
    tick_interval_seconds: int = 10
    max_ticks: int = 100


@app.post("/simulation/start")
async def start_simulation(req: StartSimulationRequest = StartSimulationRequest()):
    """Start the world simulation workflow."""
    _require_temporal()
    client = await get_client()

    try:
        handle = await client.start_workflow(
            WorldSimulationWorkflow.run,
            SimulationInput(
                tick_interval_seconds=req.tick_interval_seconds,
                max_ticks_before_continue_as_new=req.max_ticks,
            ),
            id=SIMULATION_WORKFLOW_ID,
            task_queue=settings.temporal_task_queue,
        )
    except Exception as e:
        if "already started" in str(e).lower() or "already running" in str(e).lower():
            raise HTTPException(status_code=409, detail="Simulation is already running.")
        raise HTTPException(status_code=500, detail=str(e))

    # Register all agents from the current world state
    for agent in world_state.agents:
        await handle.signal(
            WorldSimulationWorkflow.add_agent,
            AgentInfo(
                agent_id=agent.id,
                agent_name=agent.name,
                persona=f"{agent.name} is a resident of the town.",
                current_location_id=agent.location_id,
                current_action=agent.current_action,
            ),
        )

    return {
        "status": "started",
        "workflow_id": SIMULATION_WORKFLOW_ID,
        "agents_registered": len(world_state.agents),
    }


@app.post("/simulation/stop")
async def stop_simulation():
    """Send a stop signal to the simulation workflow."""
    _require_temporal()
    client = await get_client()

    try:
        handle = client.get_workflow_handle(SIMULATION_WORKFLOW_ID)
        await handle.signal(WorldSimulationWorkflow.stop_simulation)
        return {"status": "stop_signal_sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/simulation/status")
async def simulation_status():
    """Query the current simulation status from the workflow."""
    _require_temporal()
    client = await get_client()

    try:
        handle = client.get_workflow_handle(SIMULATION_WORKFLOW_ID)
        status = await handle.query(WorldSimulationWorkflow.get_status)
        return status
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Simulation not found: {e}")


class AgentCommandRequest(BaseModel):
    command: str


@app.post("/agents/{agent_id}/command")
async def agent_command(agent_id: str, req: AgentCommandRequest):
    """Send an 'inner voice' command to an agent via Temporal signal."""
    _require_temporal()
    client = await get_client()

    try:
        handle = client.get_workflow_handle(SIMULATION_WORKFLOW_ID)
        await handle.signal(
            WorldSimulationWorkflow.agent_command,
            f"{agent_id}:{req.command}",
        )
        return {"status": "command_sent", "agent_id": agent_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
