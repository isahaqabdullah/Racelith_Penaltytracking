from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .routes import session, infringements, penalties, history, infringement_log
from .ws_manager import manager
from .database import init_db, switch_session_db

# --- FastAPI app ---
app = FastAPI(title="Karting Infringement System", version="1.1")

# --- Initialize control database ---
# Only the control DB tracks session metadata
init_db()

# --- CORS Middleware ---
import os
cors_origins = os.getenv("CORS_ORIGINS", "*")
# Convert comma-separated string to list, or use ["*"] if "*" is specified
if cors_origins == "*":
    allow_origins = ["*"]
else:
    allow_origins = [origin.strip() for origin in cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Include routers ---
app.include_router(session.router, prefix="/session")
app.include_router(infringements.router, prefix="/infringements")
app.include_router(penalties.router, prefix="/penalties")
app.include_router(history.router, prefix="/history")
app.include_router(infringement_log.router, prefix="/infringement_log")

# --- Health check endpoint ---
@app.get("/api/health")
def health_check():
    return {"status": "ok"}

# --- WebSocket endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for broadcasting events.
    Any connected client will receive broadcast messages from manager.
    """
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)

# --- Optional: auto-switch to default session on startup ---
# Uncomment if you want the app to automatically switch to a default session
# default_session = "default"
# try:
#     switch_session_db(default_session)
# except Exception as e:
#     import logging
#     logging.warning(f"Could not switch to default session: {e}")
