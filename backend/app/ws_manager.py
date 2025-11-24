# === FILE: app/ws_manager.py ===
import json
import logging
from typing import List
from fastapi import WebSocket
import asyncio

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total connections: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            try:
                self.active_connections.remove(websocket)
                logger.info(f"WebSocket client disconnected. Total connections: {len(self.active_connections)}")
            except ValueError:
                pass

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        # copy list under lock then send without holding the lock to avoid deadlocks
        async with self.lock:
            connections = list(self.active_connections)
        connection_count = len(connections)
        
        if connection_count == 0:
            logger.debug("No WebSocket connections to broadcast to")
            return
        
        logger.info(f"Broadcasting message to {connection_count} WebSocket client(s)")
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send message to WebSocket client: {e}")
                disconnected.append(connection)
        if disconnected:
            async with self.lock:
                for d in disconnected:
                    try:
                        self.active_connections.remove(d)
                    except ValueError:
                        pass
            logger.info(f"Removed {len(disconnected)} disconnected client(s). Remaining: {len(self.active_connections)}")


manager = ConnectionManager()
