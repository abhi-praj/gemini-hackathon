import json
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from core.config import settings
from models.state import WorldState

app = FastAPI(title=settings.project_name)

DATA_DIR = Path(__file__).parent / "data"


def load_json(filename: str) -> dict:
    with open(DATA_DIR / filename) as f:
        return json.load(f)


# Load seed world and asset registry at startup
world_state = WorldState(**load_json("seed_world.json"))
asset_registry = load_json("asset_registry.json")


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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        print("Client disconnected")
