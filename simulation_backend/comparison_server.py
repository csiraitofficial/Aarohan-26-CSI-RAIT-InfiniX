#!/usr/bin/env python3
"""
MAPPO vs Fixed Logic Comparison Server

Runs two parallel simulations on the same network:
- MAPPO: AI-controlled traffic signals
- Fixed: Traditional round-robin 30-second timing

Provides REST API and WebSocket for real-time comparison.
Port: 8790
"""

import os
import sys
import json
import logging
import threading
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional, List
from copy import deepcopy

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Setup paths
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from traffic_env_movement import MovementNetwork, TrafficEnvCore
from mappo_inference import load_mappo_policy, build_actions_dict, flatten_obs

logger = logging.getLogger("comparison_server")
logging.basicConfig(level=logging.INFO)

# Paths
FLOWMASTERS_ROOT = SCRIPT_DIR.parent.parent
JSON_PATH = FLOWMASTERS_ROOT / "simulation" / "PhaseB" / "sambalpur_signals_15_movement.json"
CHECKPOINT_PATH = FLOWMASTERS_ROOT / "simulation" / "PhaseB" / "checkpoints_movement" / "policy_shared_final.pt"

PORT = 8790
FIXED_PHASE_DURATION = 30  # seconds per phase for fixed timing

app = FastAPI(title="MAPPO vs Fixed Logic Comparison", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ComparisonState:
    """Holds state for both simulations"""
    
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.current_step = 0
        self.total_steps = 3600
        
        # MAPPO simulation
        self.mappo_env: Optional[TrafficEnvCore] = None
        self.mappo_obs = None
        self.mappo_policy = None
        self.mappo_last_phases = None
        
        # Fixed timing simulation
        self.fixed_env: Optional[TrafficEnvCore] = None
        self.fixed_obs = None
        self.fixed_phase_timers: Dict[str, int] = {}  # signal_id -> steps in current phase
        self.fixed_current_phases: Dict[str, int] = {}  # signal_id -> current phase index
        
        # Network reference
        self.network: Optional[MovementNetwork] = None
        
        # Accumulated metrics
        self.mappo_metrics = {"total_queue": 0, "total_flow": 0, "overflow": 0}
        self.fixed_metrics = {"total_queue": 0, "total_flow": 0, "overflow": 0}
    
    def reset(self):
        with self.lock:
            self.running = False
            self.current_step = 0
            self.mappo_env = None
            self.mappo_obs = None
            self.mappo_last_phases = None
            self.fixed_env = None
            self.fixed_obs = None
            self.fixed_phase_timers = {}
            self.fixed_current_phases = {}
            self.mappo_metrics = {"total_queue": 0, "total_flow": 0, "overflow": 0}
            self.fixed_metrics = {"total_queue": 0, "total_flow": 0, "overflow": 0}


state = ComparisonState()


def get_fixed_actions(network: MovementNetwork, phase_timers: Dict, current_phases: Dict) -> Dict[str, int]:
    """
    Generate fixed-timing actions: round-robin through phases.
    Each phase gets FIXED_PHASE_DURATION seconds before switching.
    """
    actions = {}
    
    for sig in network.signals:
        sid = sig.signal_id
        n_phases = len(sig.phases)
        
        if n_phases == 0:
            continue
        
        # Initialize if not present
        if sid not in phase_timers:
            phase_timers[sid] = 0
            current_phases[sid] = 0
        
        # Check if time to switch
        phase_timers[sid] += 1
        if phase_timers[sid] >= FIXED_PHASE_DURATION:
            phase_timers[sid] = 0
            current_phases[sid] = (current_phases[sid] + 1) % n_phases
        
        actions[sid] = current_phases[sid]
    
    return actions


def extract_simulation_state(env: TrafficEnvCore, obs: Dict, network: MovementNetwork, label: str) -> Dict:
    """Extract comprehensive state from simulation for frontend"""
    
    signals_data = []
    total_queue = 0
    total_left = 0
    total_right = 0
    total_through = 0
    total_overflow = 0
    
    for sig in network.signals:
        sid = sig.signal_id
        sig_obs = obs.get(sid, {})
        
        # Get queue per movement type
        left_q = 0
        right_q = 0
        through_q = 0
        
        for m in sig.movements:
            mid = m["id"]
            q = env.queue.get(sid, {}).get(mid, 0)
            mtype = network.movement_type.get(sid, {}).get(mid, "through")
            
            if mtype == "left":
                left_q += q
            elif mtype == "right":
                right_q += q
            else:
                through_q += q
        
        signal_queue = left_q + right_q + through_q
        total_queue += signal_queue
        total_left += left_q
        total_right += right_q
        total_through += through_q
        
        # Get spillback
        overflow = env.spillback_count.get(sid, 0)
        total_overflow += overflow
        
        # Current phase
        current_phase = env.current_phase.get(sid, 0)
        phase_name = sig.phases[current_phase]["name"] if current_phase < len(sig.phases) else "Unknown"
        
        # Allowed movements in current phase
        if current_phase < len(sig.phases):
            allowed = sig.phases[current_phase].get("movements", [])
        else:
            allowed = []
        
        signals_data.append({
            "signal_id": sid,
            "lat": sig.lat,
            "lon": sig.lon,
            "queue": signal_queue,
            "left_queue": left_q,
            "right_queue": right_q,
            "through_queue": through_q,
            "overflow": overflow,
            "current_phase": current_phase,
            "phase_name": phase_name,
            "allowed_movements": allowed,
            "green_time": env.green_time.get(sid, 0),
            "in_yellow": env._yellow_active.get(sid, False)
        })
    
    return {
        "label": label,
        "signals": signals_data,
        "metrics": {
            "total_queue": total_queue,
            "left_queue": total_left,
            "right_queue": total_right,
            "through_queue": total_through,
            "overflow": total_overflow
        }
    }


class StartRequest(BaseModel):
    steps: int = Field(3600, description="Total simulation steps")
    seed: int = Field(42, description="Random seed")
    base_demand: float = Field(0.30, description="Base demand level")


@app.get("/")
def root():
    return {
        "name": "MAPPO vs Fixed Logic Comparison Server",
        "version": "1.0.0",
        "port": PORT,
        "fixed_phase_duration": FIXED_PHASE_DURATION
    }


@app.get("/api/status")
def get_status():
    with state.lock:
        return {
            "running": state.running,
            "step": state.current_step,
            "total_steps": state.total_steps,
            "mappo_metrics": state.mappo_metrics,
            "fixed_metrics": state.fixed_metrics
        }


@app.post("/api/start")
def start_comparison(req: StartRequest):
    if state.running:
        return {"status": "already_running", "step": state.current_step}
    
    if not JSON_PATH.exists():
        raise HTTPException(400, f"Network JSON not found: {JSON_PATH}")
    
    try:
        # Load network
        network = MovementNetwork(str(JSON_PATH))
        
        # Create two identical environments with same seed
        mappo_env = TrafficEnvCore(
            network=network,
            sim_step=1.0,
            base_demand_level=req.base_demand,
            dynamic_demand=True,
            seed=req.seed
        )
        
        # Create fresh network for fixed (to avoid shared state)
        network2 = MovementNetwork(str(JSON_PATH))
        fixed_env = TrafficEnvCore(
            network=network2,
            sim_step=1.0,
            base_demand_level=req.base_demand,
            dynamic_demand=True,
            seed=req.seed
        )
        
        # Reset both
        mappo_obs = mappo_env.reset()
        fixed_obs = fixed_env.reset()
        
        # Load MAPPO policy
        policy = load_mappo_policy(
            str(CHECKPOINT_PATH),
            obs_dim=6,
            n_actions=5,
            hidden=None
        )
        
        with state.lock:
            state.network = network
            state.mappo_env = mappo_env
            state.mappo_obs = mappo_obs
            state.mappo_policy = policy
            state.mappo_last_phases = None
            state.fixed_env = fixed_env
            state.fixed_obs = fixed_obs
            state.fixed_phase_timers = {}
            state.fixed_current_phases = {}
            state.running = True
            state.current_step = 0
            state.total_steps = req.steps
            state.mappo_metrics = {"total_queue": 0, "total_flow": 0, "overflow": 0}
            state.fixed_metrics = {"total_queue": 0, "total_flow": 0, "overflow": 0}
        
        logger.info(f"Comparison started with demand={req.base_demand}")
        return {"status": "started", "step": 0}
        
    except Exception as e:
        logger.exception(f"Start failed: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/step")
def step_comparison():
    """Step both simulations forward and return comparison data"""
    
    with state.lock:
        if not state.running:
            raise HTTPException(400, "Comparison not running")
        
        if state.current_step >= state.total_steps:
            state.running = False
            return {"status": "completed", "step": state.current_step}
        
        mappo_env = state.mappo_env
        fixed_env = state.fixed_env
        mappo_obs = state.mappo_obs
        fixed_obs = state.fixed_obs
        network = state.network
        policy = state.mappo_policy
    
    try:
        # MAPPO actions
        _, keys = flatten_obs(mappo_obs)
        mappo_actions = build_actions_dict(network, policy, mappo_obs, keys)
        
        # Fixed actions
        fixed_actions = get_fixed_actions(
            network, 
            state.fixed_phase_timers, 
            state.fixed_current_phases
        )
        
        # Step both environments
        mappo_next_obs, mappo_rewards, _, mappo_info = mappo_env.step(mappo_actions)
        fixed_next_obs, fixed_rewards, _, fixed_info = fixed_env.step(fixed_actions)
        
        # Extract states for frontend
        mappo_state = extract_simulation_state(mappo_env, mappo_next_obs, network, "MAPPO AI")
        fixed_state = extract_simulation_state(fixed_env, fixed_next_obs, network, "Fixed Logic")
        
        with state.lock:
            state.mappo_obs = mappo_next_obs
            state.fixed_obs = fixed_next_obs
            state.current_step += 1
            
            # Update accumulated metrics
            state.mappo_metrics["total_queue"] = mappo_state["metrics"]["total_queue"]
            state.mappo_metrics["overflow"] = mappo_state["metrics"]["overflow"]
            state.fixed_metrics["total_queue"] = fixed_state["metrics"]["total_queue"]
            state.fixed_metrics["overflow"] = fixed_state["metrics"]["overflow"]
        
        return {
            "step": state.current_step,
            "mappo": mappo_state,
            "fixed": fixed_state
        }
        
    except Exception as e:
        logger.exception(f"Step error: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/stop")
def stop_comparison():
    state.reset()
    return {"status": "stopped"}


@app.get("/api/network")
def get_network():
    """Get network topology for visualization"""
    if not JSON_PATH.exists():
        raise HTTPException(400, "Network not found")
    
    with open(JSON_PATH) as f:
        return {"network": json.load(f)}


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """WebSocket for real-time streaming comparison"""
    await websocket.accept()
    logger.info("📡 Comparison WebSocket connected")
    
    speed_ms = 500
    running = False
    
    async def stream_loop():
        nonlocal running
        while running and state.running:
            try:
                result = step_comparison()
                await websocket.send_json(result)
                await asyncio.sleep(speed_ms / 1000)
            except Exception as e:
                logger.error(f"Stream error: {e}")
                break
    
    stream_task = None
    
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            
            if action == "start":
                speed_ms = data.get("speed", 500)
                running = True
                stream_task = asyncio.create_task(stream_loop())
                await websocket.send_json({"status": "streaming", "speed": speed_ms})
            
            elif action == "pause":
                running = False
                if stream_task:
                    stream_task.cancel()
                await websocket.send_json({"status": "paused"})
            
            elif action == "speed":
                speed_ms = data.get("speed", 500)
                await websocket.send_json({"status": "speed_updated", "speed": speed_ms})
    
    except Exception as e:
        logger.info(f"WebSocket closed: {e}")
    finally:
        running = False
        if stream_task:
            stream_task.cancel()
        logger.info("📡 Comparison WebSocket disconnected")


if __name__ == "__main__":
    import uvicorn
    print(f"""
{'='*60}
🔄 MAPPO vs Fixed Logic Comparison Server
{'='*60}
   Port: {PORT}
   Network: {JSON_PATH}
   Fixed Phase Duration: {FIXED_PHASE_DURATION}s
{'='*60}
""")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
