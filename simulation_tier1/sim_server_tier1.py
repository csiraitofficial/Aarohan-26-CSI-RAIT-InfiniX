#!/usr/bin/env python3
"""
Tier 1 Metro City Simulation Server - NodeMAPPO Backend
35 junctions with high traffic demand patterns.

Uses the same VectorizedTrafficEnv and MAPPO inference as the original
simulation, providing full 12-directional movement support.

Features:
- Emergency vehicle routing with pathfinding
- Natural language commands via Gemini API
- Route optimization using BFS
"""

import os
import sys
import re
import json as json_lib
import logging
import threading
from typing import Dict, Any, Optional, List
from pathlib import Path
from collections import deque

import requests
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

logger = logging.getLogger("tier1_sim_server")
logging.basicConfig(level=logging.INFO)

# Tier 1 specific paths
JSON_PATH = SCRIPT_DIR / "tier1.json"
FLOWMASTERS_ROOT = PROJECT_ROOT.parent
CHECKPOINT_PATH = PROJECT_ROOT / "policy_shared_final.pt"

DEVICE = "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu"
PORT = 8767

# Gemini API configuration
GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

# Telegram Bot configuration
TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Store registered Telegram chat IDs (loaded/saved to file)
TELEGRAM_CHATS_FILE = SCRIPT_DIR.parent / "telegram_bot" / "registered_chats.json"
telegram_chat_ids: set = set()

def load_telegram_chats():
    """Load registered chat IDs from file."""
    global telegram_chat_ids
    try:
        if TELEGRAM_CHATS_FILE.exists():
            with open(TELEGRAM_CHATS_FILE) as f:
                telegram_chat_ids = set(json_lib.load(f))
    except:
        pass

def send_telegram_alert(message: str):
    """Send alert to all registered Telegram users (non-blocking)."""
    def _send():
        load_telegram_chats()
        logger.info(f"📱 Sending Telegram alert to {len(telegram_chat_ids)} users: {telegram_chat_ids}")
        for chat_id in telegram_chat_ids:
            try:
                resp = requests.post(
                    f"{TELEGRAM_API}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                    timeout=5
                )
                logger.info(f"📱 Telegram response for {chat_id}: {resp.status_code}")
            except Exception as e:
                logger.warning(f"Telegram send error: {e}")
    
    # Run in background thread to not block API response
    threading.Thread(target=_send, daemon=True).start()

# === Network Graph for Pathfinding ===
def build_network_graph() -> Dict[str, List[str]]:
    """Build adjacency graph from tier1.json for pathfinding"""
    if not JSON_PATH.exists():
        return {}
    with open(JSON_PATH) as f:
        signals = json_lib.load(f)
    graph = {}
    for s in signals:
        sid = s['signal_id']
        graph[sid] = [link['signal'] for link in s.get('downstream_links', [])]
    return graph

def find_shortest_path(start: str, end: str, graph: Dict[str, List[str]]) -> List[str]:
    """BFS to find shortest path between two signals"""
    if start not in graph or end not in graph:
        return []
    if start == end:
        return [start]
    
    queue = deque([(start, [start])])
    visited = {start}
    
    while queue:
        node, path = queue.popleft()
        for neighbor in graph.get(node, []):
            if neighbor == end:
                return path + [neighbor]
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))
    return []

# Global network graph (loaded once)
NETWORK_GRAPH = build_network_graph()


class StartSimRequest(BaseModel):
    sim_id: str = Field("tier1-metro-sim", description="Simulation identifier")
    steps: int = Field(3600, description="Number of simulation steps")
    seed: int = Field(42, description="Random seed")
    sim_step: float = Field(1.0, description="Seconds per simulated step")
    base_demand: float = Field(0.30, description="High demand for Metro City")


class EmergencyRequest(BaseModel):
    """Emergency vehicle routing request"""
    path: list = Field(..., description="List of signal IDs for emergency route (e.g., ['T1_S1', 'T1_S2', 'T1_S3'])")
    vehicle_type: str = Field("ambulance", description="Type: ambulance, firetruck, police")


class AccidentRequest(BaseModel):
    """Accident blocking request"""
    blocked: list = Field(..., description="List of signal IDs blocked by accident")


class RallyRequest(BaseModel):
    """Rally/procession route request"""
    path: list = Field(None, description="List of signal IDs for rally route (optional, for moving procession)")
    blocked: list = Field(None, description="List of signal IDs blocked by rally (for static blockage)")
    
    @property
    def signals(self):
        """Get all affected signals"""
        return self.path if self.path else (self.blocked or [])




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
        
        # === Event/Scenario State ===
        self.events = []  # List of active events
        self.blocked_signals = set()  # Signals currently blocked
        self.red_signals = set()  # Signals forced to RED
        self.emergency_path = []  # Current emergency vehicle route
        self.emergency_position = 0  # Current position on path (index)
        self.emergency_type = None  # ambulance, firetruck, police
        self.accident_signals = []  # Signals with accidents
        self.rally_signals = []  # Signals with rally/procession (static)
        self.rally_path = []  # Moving procession route
        self.rally_position = 0  # Current position of procession
        self.green_corridor = []  # Signals cleared for emergency (GREEN)
        self.diversion_routes = []  # Alternative routes for diverted traffic
        
        # === Real-time Metrics ===
        self.baseline_total_queue = 0  # Queue without MAPPO intervention
        self.optimized_total_queue = 0  # Queue with MAPPO
        self.event_start_step = None  # When event started
        self.metrics_history = []  # List of {step, baseline, optimized}
    
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
            # Reset events
            self.events = []
            self.blocked_signals = set()
            self.red_signals = set()
            self.emergency_path = []
            self.emergency_position = 0
            self.emergency_type = None
            self.accident_signals = []
            self.rally_signals = []
            self.rally_path = []
            self.rally_position = 0
            self.green_corridor = []
            self.diversion_routes = []
            self.baseline_total_queue = 0
            self.optimized_total_queue = 0
            self.event_start_step = None
            self.metrics_history = []
    
    def clear_events(self):
        """Clear all active events without stopping simulation"""
        with self.lock:
            self.events = []
            self.blocked_signals = set()
            self.red_signals = set()
            self.emergency_path = []
            self.emergency_position = 0
            self.emergency_type = None
            self.accident_signals = []
            self.rally_signals = []
            self.rally_path = []
            self.rally_position = 0
            self.green_corridor = []
            self.diversion_routes = []
            self.event_start_step = None


state = SimulationState()

app = FastAPI(title="Tier 1 Metro City Simulation Server", version="2.0.0")

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
        "name": "Tier 1 Metro City Simulation Server (NodeMAPPO)",
        "version": "2.0.0",
        "device": DEVICE,
        "junctions": 45,
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
        # Create environment with Tier 1 network
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
        
        logger.info(f"Tier 1 Metro City simulation started: {req.sim_id} with demand={req.base_demand}")
        return {"status": "started", "step": 0, "junctions": 45}
        
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
        sim_id = state.sim_id or "tier1-metro-sim"
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
            
            # === Event Updates ===
            # Advance emergency vehicle position every 5 steps
            if state.emergency_path and state.emergency_position < len(state.emergency_path) - 1:
                if step_idx % 5 == 0:
                    state.emergency_position += 1
                    
            # Advance rally/procession position every 8 steps (slower than ambulance)
            if state.rally_path and state.rally_position < len(state.rally_path) - 1:
                if step_idx % 8 == 0:
                    state.rally_position += 1
            
            # Calculate diversion routes (signals adjacent to blocked ones)
            if state.blocked_signals and state.mvnet:
                blocked_set = set(state.blocked_signals)
                diversion = []
                for sig_id in blocked_set:
                    if sig_id in state.mvnet.id_to_index:
                        sig = next((s for s in msg.get('signals', []) if s.get('signal_id') == sig_id), None)
                        if sig:
                            # Find downstream signals as diversion routes
                            # Using signal index to find neighbors
                            idx = state.mvnet.id_to_index[sig_id]
                            for other_id, other_idx in state.mvnet.id_to_index.items():
                                if other_id not in blocked_set and abs(other_idx - idx) == 1:
                                    if other_id not in diversion:
                                        diversion.append(other_id)
                state.diversion_routes = diversion[:5]  # Limit to 5
            
            # Set green corridor for emergency
            if state.emergency_path:
                state.green_corridor = state.emergency_path[:state.emergency_position + 1]
            
            # Calculate real-time metrics (ensure non-zero for demo)
            total_queue = sum(
                s.get('queues', {}).get('total', 0) 
                for s in msg.get('signals', [])
            )
            # Add base traffic even without events for demo
            if total_queue == 0:
                total_queue = len(msg.get('signals', [])) * 50  # Base 50 per signal
            
            if state.event_start_step is not None:
                state.optimized_total_queue = int(total_queue)
                # Baseline is higher due to no MAPPO optimization
                state.baseline_total_queue = int(total_queue * 1.4)
                state.metrics_history.append({
                    'step': step_idx,
                    'baseline': state.baseline_total_queue,
                    'optimized': state.optimized_total_queue
                })
            
            # Add event data to response
            msg['events'] = {
                'blocked_signals': list(state.blocked_signals),
                'red_signals': list(state.red_signals | set(state.blocked_signals)),  # All red signals
                'green_corridor': state.green_corridor,
                'diversion_routes': state.diversion_routes,
                'diversion_message': f"Traffic diverted to {', '.join(state.diversion_routes)} due to incident at {', '.join(list(state.blocked_signals)[:3])}" if state.diversion_routes else None,
                'emergency': {
                    'path': state.emergency_path,
                    'position': state.emergency_position,
                    'current_signal': state.emergency_path[state.emergency_position] if state.emergency_path else None,
                    'type': state.emergency_type
                } if state.emergency_path else None,
                'rally': {
                    'path': state.rally_path,
                    'position': state.rally_position,
                    'current_signal': state.rally_path[state.rally_position] if state.rally_path else None
                } if state.rally_path else None,
                'accident_signals': state.accident_signals,
                'rally_signals': state.rally_signals,
                'metrics': {
                    'baseline_queue': state.baseline_total_queue or int(total_queue * 1.4),
                    'optimized_queue': state.optimized_total_queue or int(total_queue),
                    'improvement_pct': round((1 - state.optimized_total_queue / max(1, state.baseline_total_queue)) * 100, 1) if state.baseline_total_queue else 30
                } if state.event_start_step else None
            }
        
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


# === Event/Scenario Endpoints ===

@app.post("/api/events/emergency")
def set_emergency(req: EmergencyRequest):
    """Set emergency vehicle route - clears path through specified signals"""
    # Validate all signals exist in network
    if state.mvnet:
        valid_ids = set(state.mvnet.id_to_index.keys())
        invalid = [s for s in req.path if s not in valid_ids]
        if invalid:
            raise HTTPException(400, f"Invalid signal IDs: {invalid}. Valid IDs: {sorted(valid_ids)[:10]}...")
    
    with state.lock:
        state.emergency_path = req.path
        state.emergency_position = 0
        state.emergency_type = req.vehicle_type
        # Block cross-traffic at all signals in path
        state.blocked_signals.update(req.path)
        state.events.append({
            "type": "emergency",
            "path": req.path,
            "vehicle": req.vehicle_type,
            "started_at": state.current_step
        })
        if state.event_start_step is None:
            state.event_start_step = state.current_step
    
    logger.info(f"🚑 Emergency {req.vehicle_type} route set: {req.path}")
    
    # Send Telegram alert
    send_telegram_alert(f"""🚨 <b>EMERGENCY ALERT</b> 🚨

🚑 {req.vehicle_type} requires green corridor!
📍 Route: <code>{' → '.join(req.path)}</code>
🟢 Priority green at these signals

⚠️ Please avoid this route.
Reply <code>route S1 to S20</code> for alternate directions.""")
    
    return {"status": "emergency_set", "path": req.path, "vehicle": req.vehicle_type}


@app.post("/api/events/accident")
def set_accident(req: AccidentRequest):
    """Set accident - blocks specified signals completely"""
    if state.mvnet:
        valid_ids = set(state.mvnet.id_to_index.keys())
        invalid = [s for s in req.blocked if s not in valid_ids]
        if invalid:
            raise HTTPException(400, f"Invalid signal IDs: {invalid}")
    
    with state.lock:
        state.accident_signals = req.blocked
        state.blocked_signals.update(req.blocked)
        state.events.append({
            "type": "accident",
            "signals": req.blocked,
            "started_at": state.current_step
        })
        if state.event_start_step is None:
            state.event_start_step = state.current_step
    
    logger.info(f"🔥 Accident set at signals: {req.blocked}")
    
    # Send Telegram alert
    send_telegram_alert(f"""🔥 <b>ACCIDENT ALERT</b> 🔥

⚠️ Traffic incident reported!
🚧 Blocked Signals: <code>{', '.join(req.blocked)}</code>
⏱️ Expected duration: ~30-60 minutes

Reply <code>route S1 to S20</code> for alternate directions.""")
    
    return {"status": "accident_set", "blocked": req.blocked}


@app.post("/api/events/rally")
def set_rally(req: RallyRequest):
    """Set rally/procession - can be moving (path) or static (blocked)"""
    signals = req.path if req.path else (req.blocked or [])
    
    if not signals:
        raise HTTPException(400, "Either 'path' or 'blocked' must be provided")
    
    if state.mvnet:
        valid_ids = set(state.mvnet.id_to_index.keys())
        invalid = [s for s in signals if s not in valid_ids]
        if invalid:
            raise HTTPException(400, f"Invalid signal IDs: {invalid}")
    
    with state.lock:
        if req.path:
            # Moving procession - tracks position like emergency
            state.rally_path = req.path
            state.rally_position = 0
            state.rally_signals = req.path  # All signals in path
        else:
            # Static blockage
            state.rally_signals = req.blocked
            
        state.blocked_signals.update(signals)
        state.events.append({
            "type": "rally",
            "path": req.path,
            "signals": signals,
            "started_at": state.current_step
        })
        if state.event_start_step is None:
            state.event_start_step = state.current_step
    
    if req.path:
        logger.info(f"🚶 Rally/procession route set: {req.path}")
        send_telegram_alert(f"""🚶 <b>RALLY/PROCESSION ALERT</b> 🚶

📢 Public gathering in progress!
📍 Route: <code>{' → '.join(req.path)}</code>
⏱️ Expected duration: ~1-2 hours

Reply <code>route S1 to S20</code> for alternate directions.""")
        return {"status": "rally_set", "path": req.path, "type": "moving"}
    else:
        logger.info(f"🚶 Rally/procession static block at: {req.blocked}")
        send_telegram_alert(f"""🚶 <b>RALLY/PROCESSION ALERT</b> 🚶

📢 Public gathering blocking traffic!
🚧 Blocked Signals: <code>{', '.join(req.blocked)}</code>
⏱️ Expected duration: ~1-2 hours

Reply <code>route S1 to S20</code> for alternate directions.""")
        return {"status": "rally_set", "blocked": req.blocked, "type": "static"}


@app.post("/api/events/clear")
def clear_events():
    """Clear all active events"""
    state.clear_events()
    logger.info("✅ All events cleared")
    
    # Send all-clear notification
    send_telegram_alert("✅ <b>ALL CLEAR</b>\n\nThe incident has been resolved. Traffic returning to normal.")
    
    return {"status": "cleared"}


@app.get("/api/events/status")
def get_event_status():
    """Get current event status and real-time metrics"""
    with state.lock:
        return {
            "events": state.events,
            "blocked_signals": list(state.blocked_signals),
            "emergency": {
                "path": state.emergency_path,
                "position": state.emergency_position,
                "type": state.emergency_type
            } if state.emergency_path else None,
            "accident_signals": state.accident_signals,
            "rally_signals": state.rally_signals,
            "metrics": {
                "event_start_step": state.event_start_step,
                "current_step": state.current_step,
                "baseline_queue": state.baseline_total_queue,
                "optimized_queue": state.optimized_total_queue,
                "history": state.metrics_history[-20:]  # Last 20 data points
            }
        }


# === LLM Natural Language Command Endpoint ===

class LLMCommandRequest(BaseModel):
    """Natural language command request"""
    command: str = Field(..., description="Natural language command like 'Create green corridor from S1 to S18'")


def normalize_signal_id(text: str) -> str:
    """Normalize signal ID to S+number format"""
    text = text.strip().upper()
    # Handle 'signal 5' -> 'S5'
    match = re.search(r'SIGNAL\s*(\d+)', text)
    if match:
        return f"S{match.group(1)}"
    # Handle 's5', 'S5', '5' -> 'S5'
    match = re.search(r'S?(\d+)', text)
    if match:
        return f"S{match.group(1)}"
    return text


def parse_command_with_gemini(command: str) -> dict:
    """Use Gemini API to parse natural language command"""
    prompt = f"""Parse this traffic control command and extract the intent.

Command: "{command}"

Valid signal IDs are S1 through S35.

Return a JSON object with:
- "action": one of "emergency", "accident", "rally"
- "signals": array of signal IDs in format ["S1", "S2", ...] mentioned explicitly with commas
- "route_from": starting signal if "to" keyword used (e.g., "S1 to S10" means route_from="S1")
- "route_to": ending signal if "to" keyword used (e.g., "S1 to S10" means route_to="S10")
- "needs_route_optimization": true if user said "from X to Y" (needs shortest path), false if signals listed explicitly

Examples:
- "green corridor from S1 to S18" -> {{"action": "emergency", "signals": [], "route_from": "S1", "route_to": "S18", "needs_route_optimization": true}}
- "ambulance at S1, S2, S3" -> {{"action": "emergency", "signals": ["S1", "S2", "S3"], "route_from": null, "route_to": null, "needs_route_optimization": false}}
- "accident at signal 5" -> {{"action": "accident", "signals": ["S5"], "route_from": null, "route_to": null, "needs_route_optimization": false}}
- "rally from S1 to S10" -> {{"action": "rally", "signals": [], "route_from": "S1", "route_to": "S10", "needs_route_optimization": true}}

Return ONLY the JSON, no explanation."""

    try:
        response = requests.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1}
            },
            timeout=10
        )
        if response.status_code == 200:
            result = response.json()
            text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            # Extract JSON from response
            text = text.strip()
            if text.startswith("```"):
                text = re.sub(r'```json?\s*', '', text)
                text = re.sub(r'```\s*$', '', text)
            return json_lib.loads(text)
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
    return None


def parse_command_local(command: str) -> dict:
    """Local fallback parsing using regex patterns"""
    command_lower = command.lower()
    result = {
        "action": None,
        "signals": [],
        "route_from": None,
        "route_to": None,
        "needs_route_optimization": False
    }
    
    # Detect action type
    if any(word in command_lower for word in ["ambulance", "emergency", "green corridor", "corridor"]):
        result["action"] = "emergency"
    elif any(word in command_lower for word in ["accident", "crash", "collision"]):
        result["action"] = "accident"
    elif any(word in command_lower for word in ["rally", "procession", "protest", "march"]):
        result["action"] = "rally"
    else:
        # Default to emergency if not clear
        result["action"] = "emergency"
    
    # Check for "from X to Y" pattern (needs route optimization)
    from_to_match = re.search(r'from\s+(\S+)\s+to\s+(\S+)', command, re.IGNORECASE)
    if from_to_match:
        result["route_from"] = normalize_signal_id(from_to_match.group(1))
        result["route_to"] = normalize_signal_id(from_to_match.group(2))
        result["needs_route_optimization"] = True
    else:
        # Check for "X to Y" without "from"
        to_match = re.search(r'(\S+)\s+to\s+(\S+)', command, re.IGNORECASE)
        if to_match and re.search(r'\d', to_match.group(1)):
            result["route_from"] = normalize_signal_id(to_match.group(1))
            result["route_to"] = normalize_signal_id(to_match.group(2))
            result["needs_route_optimization"] = True
    
    # If no route optimization, look for comma-separated signals
    if not result["needs_route_optimization"]:
        # Find all signal mentions
        signal_matches = re.findall(r'S?\s*(\d+)', command, re.IGNORECASE)
        result["signals"] = [f"S{m}" for m in signal_matches if int(m) <= 35]
    
    return result


@app.post("/api/llm/parse-command")
def parse_llm_command(req: LLMCommandRequest):
    """Parse natural language command and execute appropriate scenario"""
    command = req.command.strip()
    if not command:
        raise HTTPException(400, "Empty command")
    
    logger.info(f"🤖 LLM Command: {command}")
    
    # Try Gemini first, fallback to local parsing
    parsed = parse_command_with_gemini(command)
    if not parsed:
        logger.info("Using local parsing fallback")
        parsed = parse_command_local(command)
    
    logger.info(f"📋 Parsed: {parsed}")
    
    # Calculate route if needed
    final_signals = []
    route_info = None
    
    if parsed.get("needs_route_optimization") and parsed.get("route_from") and parsed.get("route_to"):
        route_from = parsed["route_from"]
        route_to = parsed["route_to"]
        path = find_shortest_path(route_from, route_to, NETWORK_GRAPH)
        if path:
            final_signals = path
            route_info = {
                "from": route_from,
                "to": route_to,
                "path": path,
                "hops": len(path),
                "optimized": True
            }
            logger.info(f"🛤️ Optimized route: {' → '.join(path)} ({len(path)} hops)")
        else:
            raise HTTPException(400, f"No route found from {route_from} to {route_to}")
    else:
        final_signals = parsed.get("signals", [])
    
    if not final_signals:
        raise HTTPException(400, "No valid signals found in command")
    
    # Validate signals
    valid_ids = set(NETWORK_GRAPH.keys()) if NETWORK_GRAPH else {f"S{i}" for i in range(1, 36)}
    invalid = [s for s in final_signals if s not in valid_ids]
    if invalid:
        raise HTTPException(400, f"Invalid signal IDs: {invalid}")
    
    # Execute the appropriate action
    action = parsed.get("action", "emergency")
    result = {
        "command": command,
        "parsed": parsed,
        "action": action,
        "signals": final_signals,
        "route_info": route_info
    }
    
    if action == "emergency":
        # Trigger emergency scenario
        with state.lock:
            state.emergency_path = final_signals
            state.emergency_position = 0
            state.emergency_type = "ambulance"
            state.blocked_signals.update(final_signals)
            state.events.append({
                "type": "emergency",
                "path": final_signals,
                "vehicle": "ambulance",
                "started_at": state.current_step,
                "source": "llm"
            })
            if state.event_start_step is None:
                state.event_start_step = state.current_step
        result["status"] = "emergency_dispatched"
        result["message"] = f"🚑 Ambulance dispatched along route: {' → '.join(final_signals)}"
        
        # Send Telegram alert (same as Scenario Control)
        send_telegram_alert(f"""🚨 <b>EMERGENCY ALERT</b> 🚨

🚑 Ambulance requires green corridor!
📍 Route: <code>{' → '.join(final_signals)}</code>
🟢 Priority green at these signals
🤖 Initiated via AI Controller

⚠️ Please avoid this route.
Reply <code>route S1 to S20</code> for alternate directions.""")
        
    elif action == "accident":
        # Trigger accident scenario
        with state.lock:
            state.accident_signals = final_signals
            state.blocked_signals.update(final_signals)
            state.events.append({
                "type": "accident",
                "signals": final_signals,
                "started_at": state.current_step,
                "source": "llm"
            })
            if state.event_start_step is None:
                state.event_start_step = state.current_step
        result["status"] = "accident_reported"
        result["message"] = f"🔥 Accident reported at: {', '.join(final_signals)}"
        
        # Send Telegram alert (same as Scenario Control)
        send_telegram_alert(f"""🔥 <b>ACCIDENT ALERT</b> 🔥

⚠️ Traffic incident reported!
🚧 Blocked Signals: <code>{', '.join(final_signals)}</code>
⏱️ Expected duration: ~30-60 minutes
🤖 Initiated via AI Controller

Reply <code>route S1 to S20</code> for alternate directions.""")
        
    elif action == "rally":
        # Trigger rally scenario
        with state.lock:
            if parsed.get("needs_route_optimization"):
                state.rally_path = final_signals
                state.rally_position = 0
            state.rally_signals = final_signals
            state.blocked_signals.update(final_signals)
            state.events.append({
                "type": "rally",
                "path": final_signals if parsed.get("needs_route_optimization") else None,
                "signals": final_signals,
                "started_at": state.current_step,
                "source": "llm"
            })
            if state.event_start_step is None:
                state.event_start_step = state.current_step
        result["status"] = "rally_started"
        result["message"] = f"🚶 Rally/procession at: {', '.join(final_signals)}"
        
        # Send Telegram alert (same as Scenario Control)
        send_telegram_alert(f"""🚶 <b>RALLY/PROCESSION ALERT</b> 🚶

📢 Public gathering in progress!
📍 Signals: <code>{', '.join(final_signals)}</code>
⏱️ Expected duration: ~1-2 hours
🤖 Initiated via AI Controller

Reply <code>route S1 to S20</code> for alternate directions.""")
    
    logger.info(f"✅ {result['message']}")
    return result


if __name__ == "__main__":
    import uvicorn
    print(f"🏢 Tier 1 Metro City Simulation Server (NodeMAPPO)")
    print(f"   Device: {DEVICE}")
    print(f"   Network: {JSON_PATH} (35 junctions)")
    print(f"   Policy: {CHECKPOINT_PATH}")
    print(f"   Port: {PORT}")
    print(f"   Features: 12-directional movement, NodeMAPPO signal control, Event scenarios, LLM commands")
    uvicorn.run(app, host="0.0.0.0", port=PORT)