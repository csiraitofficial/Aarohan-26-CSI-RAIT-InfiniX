#!/usr/bin/env python3
"""
enhanced_mappo_inference.py - Drop-in replacement for mappo_inference.py

Adds coordination logic to the MAPPO inference:
1. Neighbor pressure awareness
2. Emergency vehicle priority
3. Spillback prevention
4. Accident/Rally handling

Usage: Replace imports in sim_server.py:
  from enhanced_mappo_inference import ...
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Tuple, Optional, Set
from pathlib import Path
import json

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class PolicyNet(nn.Module):
    """Policy network matching training architecture"""
    def __init__(self, obs_dim, hidden=256, n_actions=4):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU()
        )
        self.logits = nn.Linear(hidden, n_actions)

    def forward(self, x):
        return self.logits(self.net(x))


# =============================================================================
# COORDINATION STATE (Global for the server)
# =============================================================================
class CoordinationState:
    """Manages coordination features for the enhanced inference."""
    
    def __init__(self):
        self.neighbors: Dict[str, Set[str]] = {}  # signal_id -> neighbor signal_ids
        self.emergency_paths: List[Dict] = []  # [{path: [S1, S2], position: 0, active: True}]
        self.blocked_junctions: Set[str] = set()
        self.last_actions: Dict[str, int] = {}
        self.phase_clock: Dict[str, int] = {}
        self.queues_cache: Dict[str, List[float]] = {}
    
    def init_from_network(self, signals: List[Dict]):
        """Initialize neighbors from network structure."""
        self.neighbors = {s["signal_id"]: set() for s in signals}
        for s in signals:
            sid = s["signal_id"]
            for link in s.get("downstream_links", []):
                target = link.get("target_signal")
                if target and target in self.neighbors:
                    self.neighbors[sid].add(target)
                    self.neighbors[target].add(sid)
            self.last_actions[sid] = 0
            self.phase_clock[sid] = 0
    
    def set_emergency(self, path: List[str], vehicle_type: str = "ambulance"):
        """Add emergency vehicle path."""
        self.emergency_paths.append({
            "type": vehicle_type,
            "path": path,
            "position": 0,
            "active": True
        })
        return {"status": "emergency_set", "path": path}
    
    def set_accident(self, blocked: List[str]):
        """Set accident blocking junctions."""
        self.blocked_junctions.update(blocked)
        return {"status": "accident_set", "blocked": blocked}
    
    def set_rally(self, blocked: List[str]):
        """Set rally/procession blocking junctions."""
        self.blocked_junctions.update(blocked)
        return {"status": "rally_set", "blocked": blocked}
    
    def clear_events(self):
        """Clear all events."""
        self.emergency_paths = []
        self.blocked_junctions = set()
        return {"status": "events_cleared"}
    
    def get_neighbor_pressure(self, signal_id: str) -> float:
        """Get average queue of neighbors."""
        neighbors = self.neighbors.get(signal_id, set())
        if not neighbors:
            return 0.0
        pressures = [sum(self.queues_cache.get(n, [0, 0, 0])) for n in neighbors]
        return sum(pressures) / len(pressures) if pressures else 0.0
    
    def check_emergency_priority(self, signal_id: str) -> Optional[int]:
        """Check if emergency vehicle needs priority."""
        for ev in self.emergency_paths:
            if not ev["active"]:
                continue
            pos = ev["position"]
            path = ev["path"]
            for offset in range(3):
                if pos + offset < len(path) and path[pos + offset] == signal_id:
                    return 0  # Force phase 0 for emergency
        return None
    
    def update_emergency_positions(self, actions: Dict[str, int]):
        """Move emergency vehicles that got green."""
        for ev in self.emergency_paths:
            if ev["active"] and ev["position"] < len(ev["path"]):
                current_sig = ev["path"][ev["position"]]
                if actions.get(current_sig) == 0:
                    ev["position"] += 1
                    if ev["position"] >= len(ev["path"]):
                        ev["active"] = False


# Global coordination state
coord_state = CoordinationState()


# =============================================================================
# ORIGINAL FUNCTIONS (kept for compatibility)
# =============================================================================
def flatten_obs(obs_dict: Dict[int, Dict[str, np.ndarray]]) -> Tuple[np.ndarray, List[Tuple[int, str]]]:
    """Flatten observations to numpy array."""
    all_obs = []
    keys = []
    for env_idx in sorted(obs_dict.keys()):
        for signal_id in sorted(obs_dict[env_idx].keys()):
            keys.append((env_idx, signal_id))
            all_obs.append(obs_dict[env_idx][signal_id])
    return np.array(all_obs, dtype=np.float32), keys


def load_mappo_policy(checkpoint_path: str, obs_dim: int, n_actions: int = 4, hidden: int = None) -> PolicyNet:
    """Load trained MAPPO policy from checkpoint."""
    state_dict = torch.load(checkpoint_path, map_location=DEVICE)
    
    if hidden is None:
        hidden = state_dict['net.0.weight'].shape[0]
    
    if 'logits.weight' in state_dict:
        n_actions = state_dict['logits.weight'].shape[0]
    
    policy = PolicyNet(obs_dim, hidden, n_actions).to(DEVICE)
    policy.load_state_dict(state_dict)
    policy.eval()
    
    print(f"✓ Enhanced MAPPO loaded (obs={obs_dim}, hidden={hidden}, actions={n_actions})")
    return policy


# =============================================================================
# ENHANCED BUILD_ACTIONS_DICT
# =============================================================================
def build_actions_dict(
    mvnet,
    policy: PolicyNet,
    obs: Dict[int, Dict[str, np.ndarray]],
    keys: List[Tuple[int, str]]
) -> Dict[int, Dict[str, int]]:
    """
    Generate actions with enhanced coordination.
    Drop-in replacement for original build_actions_dict.
    """
    # Initialize coordination state if needed
    if not coord_state.neighbors:
        coord_state.init_from_network(mvnet.signals)
    
    # Cache queues for neighbor pressure
    for env_idx, signal_id in keys:
        if signal_id in obs.get(env_idx, {}):
            vec = obs[env_idx][signal_id]
            coord_state.queues_cache[signal_id] = [vec[0], vec[1], vec[2]]
    
    # Flatten and get base MAPPO actions
    obs_arr, _ = flatten_obs(obs)
    
    # Add neighbor pressure to observations (use prediction slot)
    for i, (env_idx, signal_id) in enumerate(keys):
        neighbor_pressure = coord_state.get_neighbor_pressure(signal_id)
        obs_arr[i, 5] = neighbor_pressure  # Use prediction slot for coordination
    
    obs_tensor = torch.from_numpy(obs_arr).to(DEVICE)
    
    with torch.no_grad():
        logits = policy(obs_tensor)
        base_actions = logits.argmax(dim=-1).cpu().numpy()
    
    # Build result with enhanced coordination
    result = {}
    for i, (env_idx, signal_id) in enumerate(keys):
        if env_idx not in result:
            result[env_idx] = {}
        
        # 1. Check emergency priority FIRST
        emergency_action = coord_state.check_emergency_priority(signal_id)
        if emergency_action is not None:
            action = emergency_action
        else:
            action = int(base_actions[i])
            
            # 2. Check if blocked
            if signal_id in coord_state.blocked_junctions:
                action = 0  # Safe phase
            
            # 3. Spillback prevention
            own_queue = sum(coord_state.queues_cache.get(signal_id, [0, 0, 0]))
            neighbor_pressure = coord_state.get_neighbor_pressure(signal_id)
            
            if neighbor_pressure > 0.7 and own_queue < 0.3:
                # Downstream congested, hold vehicles
                if coord_state.phase_clock.get(signal_id, 0) < 15:
                    action = coord_state.last_actions.get(signal_id, 0)
        
        # Clamp to valid phases
        sig_idx = mvnet.id_to_index.get(signal_id, 0)
        n_phases = max(1, mvnet.signals[sig_idx].n_phases)
        action = action % n_phases
        
        # Update tracking
        if action != coord_state.last_actions.get(signal_id):
            coord_state.phase_clock[signal_id] = 0
        else:
            coord_state.phase_clock[signal_id] = coord_state.phase_clock.get(signal_id, 0) + 1
        coord_state.last_actions[signal_id] = action
        
        result[env_idx][signal_id] = action
    
    # Update emergency vehicle positions
    if result:
        coord_state.update_emergency_positions(result.get(0, {}))
    
    return result


# =============================================================================
# ORIGINAL BUILD_STEP_MESSAGE (unchanged, import from original)
# =============================================================================
def build_step_message(
    sim_id: str,
    t: int,
    sim_step: float,
    obs: Dict[int, Dict[str, np.ndarray]],
    info: Dict[int, Dict[str, any]],
    mvnet,
    last_phases: Dict[str, int] = None
) -> Tuple[Dict, Dict[str, int]]:
    """Build JSON message for frontend - same as original."""
    # Import original implementation
    from mappo_inference import build_step_message as original_build_step_message
    return original_build_step_message(sim_id, t, sim_step, obs, info, mvnet, last_phases)


# =============================================================================
# API HELPERS (for sim_server to call)
# =============================================================================
def set_emergency_vehicle(path: List[str], vehicle_type: str = "ambulance"):
    """API: Set emergency vehicle path."""
    return coord_state.set_emergency(path, vehicle_type)

def set_accident(blocked: List[str]):
    """API: Set accident blocking junctions."""
    return coord_state.set_accident(blocked)

def set_rally(blocked: List[str]):
    """API: Set rally blocking junctions."""
    return coord_state.set_rally(blocked)

def clear_events():
    """API: Clear all events."""
    return coord_state.clear_events()

def get_coordination_status():
    """API: Get current coordination state."""
    return {
        "active_emergencies": sum(1 for ev in coord_state.emergency_paths if ev["active"]),
        "blocked_junctions": list(coord_state.blocked_junctions),
        "emergency_paths": [
            {"path": ev["path"], "position": ev["position"], "active": ev["active"]}
            for ev in coord_state.emergency_paths
        ]
    }
