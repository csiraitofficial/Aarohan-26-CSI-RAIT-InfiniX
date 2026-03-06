from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import random
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TrafficBackend")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/predictions")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_host = websocket.client.host
    logger.info(f"✅ Client connected: {client_host}")
    
    try:
        while True:
            # Generate simulated traffic data
            data = {
                "cars": random.randint(10, 50),
                "bikes": random.randint(5, 25),
                "trucks": random.randint(2, 15),
                "timestamp": datetime.now().isoformat()
            }
            
            # Debug: Log the data being sent
            logger.debug(f"Sending update to {client_host}: {data}")
            
            await websocket.send_json(data)
            await asyncio.sleep(2)
            
    except WebSocketDisconnect:
        logger.warning(f"❌ Client disconnected: {client_host}")
    except Exception as e:
        logger.error(f"🔥 Unexpected error: {e}")
    finally:
        # Ensure connection is closed properly if not already
        try:
            await websocket.close()
        except:
            pass

@app.get("/api/health")
async def health_check():
    return {"status": "online", "websocket_route": "/ws/predictions"}

if __name__ == "__main__":
    import uvicorn
    # Use log_level="info" to see your logger output in the console
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")