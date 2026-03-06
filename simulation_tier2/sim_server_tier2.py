#!/usr/bin/env python3
"""
Tier 2 Medium City Simulation Server - NodeMAPPO Backend
35 junctions with moderate traffic demand patterns.

Uses the same VectorizedTrafficEnv and MAPPO inference as the original
simulation, providing full 12-directional movement support.
"""

import os
import sys
import logging
import threading
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Setup paths - add simulation_backend to path for imports
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
SIMULATION_BACKEND = PROJECT_ROOT / "simulation_backend"
sys.path.insert(0, str(SIMULATION_BACKEND))

from traffic_env_movement import VectorizedTrafficEnv
from mappo_inference import (
    load_mappo_policy,
    build_actions_dict,
    build_step_message,
    flatten_obs,
)

logger = logging.getLogger("tier2_sim_server")
logging.basicConfig(level=logging.INFO)

# Tier 2 specific paths
JSON_PATH = SCRIPT_DIR / "tier2.json"
FLOWMASTERS_ROOT = PROJECT_ROOT.parent
CHECKPOINT_PATH = FLOWMASTERS_ROOT / "simulation" / "PhaseB" / "checkpoints_movement" / "policy_shared_final.pt"

DEVICE = "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu"
PORT = 8768


class StartSimRequest(BaseModel):
    sim_id: str = Field("tier2-medium-sim", description="Simulation identifier")
    steps: int = Field(3600, description="Number of simulation steps")
    seed: int = Field(42, description="Random seed")
    sim_step: float = Field(1.0, description="Seconds per simulated step")
    base_demand: float = Field(0.22, description="Moderate demand for Medium City")


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

app = FastAPI(title="Tier 2 Medium City Simulation Server", version="2.0.0")

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
        "name": "Tier 2 Medium City Simulation Server (NodeMAPPO)",
        "version": "2.0.0",
        "device": DEVICE,
        "junctions": 35,
        "port": PORT,
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
        # Create environment with Tier 2 network
        env = VectorizedTrafficEnv(
            str(JSON_PATH),
            n_envs=1,
            sim_step=req.sim_step,
            base_demand_level=req.base_demand,
            dynamic_demand=True,
            seed=req.seed,
        )
        
        # Get the movement network from the env
        mvnet = env.network
        
        obs = env.reset()
        
        # Load MAPPO policy (shared across all tiers)
        policy = load_mappo_policy(
            str(CHECKPOINT_PATH),
            obs_dim=6,
            n_actions=5,
            hidden=None
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
        
        logger.info(f"Tier 2 Medium City simulation started: {req.sim_id} with demand={req.base_demand}")
        return {"status": "started", "step": 0, "junctions": 35}
        
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
        sim_id = state.sim_id or "tier2-medium-sim"
        step_idx = state.current_step
    
    try:
        # Flatten observations
        obs_arr, keys = flatten_obs(obs_snapshot)
        
        # Build actions using NodeMAPPO policy
        actions_dict = build_actions_dict(mvnet, policy, obs_snapshot, keys)
        
        # Step the environment (with 12-directional movement)
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


@app.get("/api/network")
def get_network():
    if not JSON_PATH.exists():
        raise HTTPException(400, "Network not found")
    
    import json
    with open(JSON_PATH) as f:
        return {"network": json.load(f)}


if __name__ == "__main__":
    import uvicorn
    print(f"🏙️ Tier 2 Medium City Simulation Server (NodeMAPPO)")
    print(f"   Device: {DEVICE}")
    print(f"   Network: {JSON_PATH} (35 junctions)")
    print(f"   Policy: {CHECKPOINT_PATH}")
    print(f"   Port: {PORT}")
    print(f"   Features: 12-directional movement, NodeMAPPO signal control")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
