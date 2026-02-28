from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from core.config import settings
from models.state import WorldState, EnvironmentNode

app = FastAPI(title=settings.project_name)

# Initial dummy state
world_state = WorldState(
    environment_root=EnvironmentNode(
        id="world",
        name="The World",
        description="The root environment node."
    ),
    agents=[]
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Generative AI World Server"}

@app.get("/state", response_model=WorldState)
def get_state():
    return world_state

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Placeholder for WebSocket loop
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        print("Client disconnected")
