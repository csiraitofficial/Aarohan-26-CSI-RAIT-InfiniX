#!/usr/bin/env python3
"""
MAPPO Traffic Simulation Server - Using VehicleDash Backend
Uses the same environment and inference as vehicledash for accurate simulation.
"""

import os
import logging
import threading
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Setup paths
SCRIPT_DIR = Path(__file__).parent
# simulation_backend is directly in FlowMasters-frontend-final, which is in Flowmasters
FLOWMASTERS_ROOT = SCRIPT_DIR.parent.parent

from traffic_env_movement import VectorizedTrafficEnv
from mappo_inference import (
    load_mappo_policy,
    build_actions_dict,
    build_step_message,
    flatten_obs,
)

# Add project root to path for telegram_bot import
import sys
sys.path.append(str(SCRIPT_DIR.parent))
from telegram_bot import telegram_alert_bot

logger = logging.getLogger("mappo_sim_server")
logging.basicConfig(level=logging.INFO)

JSON_PATH = SCRIPT_DIR.parent / "sambalpur_signals_15_movement.json"
CHECKPOINT_PATH = SCRIPT_DIR.parent / "policy_shared_final.pt"

DEVICE = "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu"


class StartSimRequest(BaseModel):
    sim_id: str = Field("mappo-sim-1", description="Simulation identifier")
    steps: int = Field(3600, description="Number of simulation steps")
    seed: int = Field(42, description="Random seed")
    sim_step: float = Field(1.0, description="Seconds per simulated step")
    base_demand: float = Field(0.30, description="Base traffic demand level")


class SimulationState:
    """Thread-safe simulation state storage"""
    
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.sim_id = None
        self.current_step = 0
        self.total_steps = 3600
        self.error = None
        
        # Environment and policy
        self.env: Optional[VectorizedTrafficEnv] = None
        self.mvnet = None
        self.policy = None
        self.obs: Optional[Dict[int, Dict[str, Any]]] = None
        self.last_phases: Optional[Dict[str, int]] = None
        
        # Latest state message
        self.latest_state: Optional[Dict[str, Any]] = None
    
    def reset(self):
        with self.lock:
            self.running = False
            self.sim_id = None
            self.current_step = 0
            self.total_steps = 3600
            self.error = None
            self.env = None
            self.mvnet = None
            self.policy = None
            self.obs = None
            self.last_phases = None
            self.latest_state = None


state = SimulationState()

app = FastAPI(title="MAPPO Traffic Simulation Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "name": "MAPPO Traffic Simulation Server (VehicleDash Backend)",
        "version": "2.0.0",
        "device": DEVICE,
    }


@app.get("/api/sim/status")
def get_status():
    with state.lock:
        return {
            "running": state.running,
            "sim_id": state.sim_id,
            "step": state.current_step,
            "total_steps": state.total_steps,
            "error": state.error,
        }


@app.post("/api/sim/start")
def start_simulation(req: StartSimRequest):
    with state.lock:
        if state.running:
            return {"status": "already_running", "step": state.current_step}
    
    if not JSON_PATH.exists():
        raise HTTPException(400, f"Network JSON not found: {JSON_PATH}")
    
    try:
        # Create environment (it loads network internally)
        env = VectorizedTrafficEnv(
            str(JSON_PATH),  # positional argument
            n_envs=1,
            sim_step=req.sim_step,
            base_demand_level=req.base_demand,
            dynamic_demand=True,
            seed=req.seed,
        )
        
        # Get the movement network from the env
        mvnet = env.network
        
        obs = env.reset()
        
        # Load MAPPO policy with correct signature:
        # load_mappo_policy(checkpoint_path, obs_dim, n_actions, hidden)
        policy = load_mappo_policy(
            str(CHECKPOINT_PATH),
            obs_dim=6,  # observation vector length
            n_actions=5,  # max phases
            hidden=None  # auto-detect from checkpoint
        )
        
        with state.lock:
            state.env = env
            state.mvnet = mvnet
            state.policy = policy
            state.obs = obs
            state.running = True
            state.sim_id = req.sim_id
            state.current_step = 0
            state.total_steps = req.steps
            state.last_phases = None
            state.error = None
        
        logger.info(f"Simulation started: {req.sim_id} with demand={req.base_demand}")
        return {"status": "started", "step": 0}
        
    except Exception as e:
        logger.exception(f"Start failed: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/sim/step")
def step_simulation():
    with state.lock:
        if not state.running or state.env is None or state.obs is None:
            raise HTTPException(400, "Simulation not running")
        
        if state.current_step >= state.total_steps:
            state.running = False
            return state.latest_state
        
        env = state.env
        mvnet = state.mvnet
        policy = state.policy
        obs_snapshot = state.obs
        sim_id = state.sim_id or "mappo-sim"
        step_idx = state.current_step
    
    try:
        # Flatten observations
        obs_arr, keys = flatten_obs(obs_snapshot)
        
        # Build actions using MAPPO policy
        actions_dict = build_actions_dict(mvnet, policy, obs_snapshot, keys)
        
        # Step the environment
        next_obs, _rewards, _dones, info = env.step(actions_dict)
        
        # Build JSON message for frontend
        msg, new_phases = build_step_message(
            sim_id=sim_id,
            t=step_idx,
            sim_step=1.0,
            obs=next_obs,
            info=info,
            mvnet=mvnet,
            last_phases=state.last_phases,
        )
        
        with state.lock:
            state.obs = next_obs
            state.current_step += 1
            state.latest_state = msg
            state.last_phases = new_phases
        
        return msg
        
    except Exception as e:
        logger.exception(f"Step error: {e}")
        with state.lock:
            state.error = str(e)
            state.running = False
        raise HTTPException(500, str(e))


@app.post("/api/sim/stop")
def stop_simulation():
    state.reset()
    return {"status": "stopped"}


@app.get("/api/sim/network")
def get_network():
    if not JSON_PATH.exists():
        raise HTTPException(400, "Network not found")
    
    import json
    with open(JSON_PATH) as f:
        return {"network": json.load(f)}


class EmergencyAlertRequest(BaseModel):
    path: list
    vehicle_type: str = "Ambulance"

@app.post("/api/alert/emergency")
async def trigger_emergency(req: EmergencyAlertRequest):
    """Trigger an emergency alert via Telegram Bot"""
    try:
        print(f"🔔 Received alert request for: {req.vehicle_type}")
        print(f"📂 Loading chats from: {telegram_alert_bot.CHATS_FILE}")
        
        # reload users to ensure we have latest
        telegram_alert_bot.load_registered_users()
        
        user_count = len(telegram_alert_bot.registered_users)
        print(f"👥 Found {user_count} registered users: {telegram_alert_bot.registered_users}")
        
        if user_count == 0:
            print("⚠️ No users to alert!")
            return {"status": "no_users", "message": "No registered users found. Send /start to bot."}

        # trigger alert
        await telegram_alert_bot.trigger_emergency_alert(req.path, req.vehicle_type)
        print("✅ Alert triggered successfully")
        return {"status": "alert_sent", "count": user_count}
    except Exception as e:
        logger.exception(f"Alert failed: {e}")
        print(f"❌ Alert failed: {e}")
        raise HTTPException(500, str(e))


# =============================================================================
# SHARED INCIDENT/ALERT STORAGE (Cross-Device Sync)
# =============================================================================
# In-memory storage - persists as long as server is running
shared_incidents = []
shared_alerts = []

class IncidentCreate(BaseModel):
    """Model for creating incidents from frontend"""
    id: str
    type: str  # 'accident', 'breakdown', 'sos', etc.
    severity: str  # 'low', 'medium', 'high', 'critical'
    status: str = "reported"
    location: dict  # {coordinates: [lat, lon], address: str, landmark: str}
    reportedBy: str
    reporterPhone: str = None
    reportedAt: str
    description: str
    affectedLanes: int = 0
    notes: list = []

class AlertCreate(BaseModel):
    """Model for creating alerts from frontend"""
    id: str
    type: str  # 'incident', 'violation', 'system', etc.
    priority: str  # 'low', 'medium', 'high', 'critical'
    message: str
    location: str = None
    coordinates: list = None
    reporterPhone: str = None
    timestamp: str
    read: bool = False

@app.get("/api/incidents")
async def get_incidents():
    """Get all shared incidents"""
    return {"incidents": shared_incidents}

@app.post("/api/incidents")
async def add_incident(incident: IncidentCreate):
    """Add a new incident (SOS, accident, etc.) - syncs across all devices"""
    incident_dict = incident.dict()
    # Add to front of list (newest first)
    shared_incidents.insert(0, incident_dict)
    # Keep only last 100 incidents
    if len(shared_incidents) > 100:
        shared_incidents.pop()
    logger.info(f"🆘 New incident added: {incident.id} ({incident.type}) - Total: {len(shared_incidents)}")
    return {"status": "added", "id": incident.id}

@app.delete("/api/incidents/{incident_id}")
async def delete_incident(incident_id: str):
    """Remove an incident"""
    global shared_incidents
    shared_incidents = [i for i in shared_incidents if i.get("id") != incident_id]
    return {"status": "deleted", "id": incident_id}

@app.get("/api/alerts")
async def get_alerts():
    """Get all shared alerts"""
    return {"alerts": shared_alerts}

@app.post("/api/alerts")
async def add_alert(alert: AlertCreate):
    """Add a new alert - syncs across all devices"""
    alert_dict = alert.dict()
    shared_alerts.insert(0, alert_dict)
    # Keep only last 100 alerts
    if len(shared_alerts) > 100:
        shared_alerts.pop()
    logger.info(f"🔔 New alert added: {alert.id} ({alert.priority}) - Total: {len(shared_alerts)}")
    return {"status": "added", "id": alert.id}

@app.patch("/api/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    """Mark an alert as read"""
    for alert in shared_alerts:
        if alert.get("id") == alert_id:
            alert["read"] = True
            return {"status": "updated", "id": alert_id}
    raise HTTPException(404, f"Alert {alert_id} not found")

@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """Remove an alert"""
    global shared_alerts
    shared_alerts = [a for a in shared_alerts if a.get("id") != alert_id]
    return {"status": "deleted", "id": alert_id}


if __name__ == "__main__":
    import uvicorn
    print(f"🚀 MAPPO Traffic Simulation Server (VehicleDash Backend)")
    print(f"   Device: {DEVICE}")
    print(f"   JSON: {JSON_PATH}")
    print(f"   Policy: {CHECKPOINT_PATH}")
    print(f"   Port: 8766")
    uvicorn.run(app, host="0.0.0.0", port=8766)
