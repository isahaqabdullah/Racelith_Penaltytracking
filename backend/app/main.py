from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routes import session, infringements, penalties, history, infringement_log
from .ws_manager import manager
from .database import init_db, switch_session_db, ControlSessionLocal
from .models import SessionInfo
from .vars import get_warning_expiry_minutes, set_warning_expiry_minutes
from pydantic import BaseModel
import logging
import json

logger = logging.getLogger(__name__)

# --- Startup: Restore active session ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # --- Initialize control database ---
    # Only the control DB tracks session metadata
    init_db()
    
    # Restore active session if one exists
    try:
        db = ControlSessionLocal()
        try:
            active_session = db.query(SessionInfo).filter(SessionInfo.status == "active").first()
            if active_session:
                try:
                    switch_session_db(active_session.name)
                    logger.info(f"Restored active session: {active_session.name}")
                except Exception as e:
                    logger.warning(f"Could not restore active session '{active_session.name}': {e}")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Error restoring active session on startup: {e}")
    
    yield
    # Shutdown (if needed)

# --- FastAPI app ---
app = FastAPI(title="Karting Infringement System", version="1.1", lifespan=lifespan)

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

class ConfigUpdate(BaseModel):
    warning_expiry_minutes: int

@app.get("/api/config")
def get_config():
    """Get application configuration values."""
    return {
        "warning_expiry_minutes": get_warning_expiry_minutes()
    }

@app.put("/api/config")
def update_config(config: ConfigUpdate):
    """Update application configuration values."""
    if config.warning_expiry_minutes < 1:
        raise HTTPException(status_code=400, detail="Warning expiry minutes must be at least 1")
    set_warning_expiry_minutes(config.warning_expiry_minutes)
    return {
        "warning_expiry_minutes": config.warning_expiry_minutes,
        "message": "Configuration updated successfully"
    }

# --- WebSocket endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for broadcasting events.
    Any connected client will receive broadcast messages from manager.
    """
    try:
        await manager.connect(websocket)
        # Send a welcome message to confirm connection
        await websocket.send_text(json.dumps({"type": "connected", "message": "WebSocket connection established"}))
        
        while True:
            # Keep connection alive by receiving messages (client may send ping/heartbeat)
            # Use receive() instead of receive_text() to handle both text and binary
            data = await websocket.receive()
            if "text" in data:
                # Client sent text (could be ping/heartbeat)
                pass
            elif "bytes" in data:
                # Client sent binary data
                pass
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected normally")
        await manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        await manager.disconnect(websocket)

# --- Optional: auto-switch to default session on startup ---
# Uncomment if you want the app to automatically switch to a default session
# default_session = "default"
# try:
#     switch_session_db(default_session)
# except Exception as e:
#     import logging
#     logging.warning(f"Could not switch to default session: {e}")
