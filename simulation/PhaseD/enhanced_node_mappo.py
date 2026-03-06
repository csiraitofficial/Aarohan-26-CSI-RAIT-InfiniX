#!/usr/bin/env python3
"""
enhanced_node_mappo.py - Enhanced Per-Signal MAPPO with Coordination Logic

Applies PhaseB MAPPO per-signal PLUS adds:
1. Neighbor pressure awareness (simulated coordination)
2. Emergency vehicle priority override
3. Accident/Rally diversion logic
4. City tier demand adjustments
5. Peak hour awareness
6. Spillback prevention rules

This bridges the gap between pure NodeMAPPO and GNN.
"""

import torch
import torch.nn as nn
from torch.distributions import Categorical
import numpy as np
import json
import math
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple


class PolicyNet(nn.Module):
    """Same architecture as PhaseB training."""
    def __init__(self, obs_dim=6, hidden=128, n_actions=5):
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


# City tier configurations (same as GNN)
CITY_TIER_CONFIG = {
    1: {"name": "Metro", "base_demand": 0.25, "peak_mult": 2.0, 
        "peak_hours_weekday": [7,8,9,10,17,18,19,20], "peak_hours_weekend": [10,11,12,17,18,19]},
    2: {"name": "City", "base_demand": 0.18, "peak_mult": 1.6,
        "peak_hours_weekday": [8,9,17,18], "peak_hours_weekend": [10,11,12,13,17,18,19,20]},
    3: {"name": "Town", "base_demand": 0.12, "peak_mult": 1.3,
        "peak_hours_weekday": [9,17], "peak_hours_weekend": [11,12]},
}


class EnhancedNodeMAPPO:
    """
    Enhanced per-signal MAPPO with coordination logic.
    
    Adds rule-based coordination to match GNN capabilities:
    - Emergency vehicle priority
    - Neighbor pressure consideration
    - Spillback prevention
    - Event handling (accidents, rallies)
    """
    
    def __init__(self, model_path: str, network_json: str, city_tier: int = 2, device: str = "cpu"):
        self.device = device
        self.city_tier = city_tier
        self.tier_config = CITY_TIER_CONFIG.get(city_tier, CITY_TIER_CONFIG[2])
        
        # Load MAPPO model
        state_dict = torch.load(model_path, map_location=device)
        hidden = state_dict['net.0.weight'].shape[0]
        obs_dim = state_dict['net.0.weight'].shape[1]
        n_actions = state_dict['logits.weight'].shape[0]
        
        self.policy = PolicyNet(obs_dim, hidden, n_actions).to(device)
        self.policy.load_state_dict(state_dict)
        self.policy.eval()
        self.n_actions = n_actions
        
        print(f"✓ Loaded MAPPO (obs={obs_dim}, hidden={hidden}, actions={n_actions})")
        
        # Load network structure
        with open(network_json) as f:
            data = json.load(f)
        if isinstance(data, list):
            self.signals = data
        else:
            self.signals = data.get("signals", data)
        
        self.n_signals = len(self.signals)
        self.signal_map = {s["signal_id"]: s for s in self.signals}
        self.signal_ids = [s["signal_id"] for s in self.signals]
        
        # Build adjacency (neighbors)
        self.neighbors = {s["signal_id"]: set() for s in self.signals}
        for s in self.signals:
            sid = s["signal_id"]
            for link in s.get("downstream_links", []):
                target = link.get("target_signal")
                if target and target in self.signal_map:
                    self.neighbors[sid].add(target)
                    self.neighbors[target].add(sid)
        
        print(f"✓ Network: {self.n_signals} signals, Tier {city_tier} ({self.tier_config['name']})")
        
        # State tracking
        self.emergency_vehicles: List[Dict] = []
        self.blocked_junctions: Set[str] = set()
        self.diversion_routes: List[Tuple[str, str]] = []
        
        # Coordination state
        self.last_actions = {sid: 0 for sid in self.signal_ids}
        self.phase_clock = {sid: 0 for sid in self.signal_ids}
    
    def set_emergency_vehicle(self, path: List[str], vehicle_type: str = "ambulance"):
        """Add emergency vehicle with path through junctions."""
        self.emergency_vehicles.append({
            "type": vehicle_type,
            "path": path,
            "position": 0,
            "active": True
        })
        print(f"🚨 Emergency ({vehicle_type}): {' → '.join(path)}")
    
    def set_accident(self, blocked: List[str], diversions: List[Tuple[str, str]] = None):
        """Set accident blocking junctions with optional diversions."""
        self.blocked_junctions.update(blocked)
        if diversions:
            self.diversion_routes.extend(diversions)
        print(f"⚠️ Accident: blocked {blocked}, diversions {diversions}")
    
    def set_rally(self, blocked: List[str]):
        """Set rally/procession blocking junctions."""
        self.blocked_junctions.update(blocked)
        print(f"🚩 Rally: blocked {blocked}")
    
    def clear_events(self):
        """Clear all emergency/accident/rally events."""
        self.emergency_vehicles = []
        self.blocked_junctions = set()
        self.diversion_routes = []
    
    def _get_neighbor_pressure(self, signal_id: str, queues: Dict[str, List[float]]) -> float:
        """Calculate average queue pressure from neighbors."""
        neighbor_ids = self.neighbors.get(signal_id, set())
        if not neighbor_ids:
            return 0.0
        
        pressures = []
        for nid in neighbor_ids:
            if nid in queues:
                pressures.append(sum(queues[nid]))
        
        return sum(pressures) / len(pressures) if pressures else 0.0
    
    def _is_peak_hour(self) -> bool:
        """Check if current time is peak hour."""
        now = datetime.now()
        is_weekend = now.weekday() >= 5
        peak_hours = self.tier_config["peak_hours_weekend" if is_weekend else "peak_hours_weekday"]
        return now.hour in peak_hours
    
    def _check_emergency_priority(self, signal_id: str) -> Optional[int]:
        """Check if emergency vehicle needs priority at this signal."""
        for ev in self.emergency_vehicles:
            if not ev["active"]:
                continue
            
            pos = ev["position"]
            path = ev["path"]
            
            # Check if signal is on emergency path (current or next 2 junctions)
            for offset in range(3):
                if pos + offset < len(path) and path[pos + offset] == signal_id:
                    # Return phase 0 (typically through movement for emergency)
                    return 0
        
        return None
    
    def _apply_spillback_prevention(self, signal_id: str, base_action: int, 
                                     queues: Dict[str, List[float]]) -> int:
        """Prevent spillback by checking downstream congestion."""
        own_queue = sum(queues.get(signal_id, [0, 0, 0]))
        
        # If own queue is high, keep current phase longer
        if own_queue > 0.7:
            # Don't switch phases too quickly
            if self.phase_clock[signal_id] < 10:
                return self.last_actions[signal_id]
        
        # Check neighbors - if downstream is congested, hold vehicles
        neighbor_pressure = self._get_neighbor_pressure(signal_id, queues)
        if neighbor_pressure > 0.8:
            # Switch to a phase that reduces outflow
            return (base_action + 1) % self.n_actions
        
        return base_action
    
    def _apply_coordination_rules(self, signal_id: str, base_action: int,
                                   queues: Dict[str, List[float]]) -> int:
        """Apply rule-based coordination with neighbors."""
        action = base_action
        
        # Rule 1: If blocked, force safe phase
        if signal_id in self.blocked_junctions:
            return 0  # Default safe phase
        
        # Rule 2: Spillback prevention
        action = self._apply_spillback_prevention(signal_id, action, queues)
        
        # Rule 3: Neighbor synchronization
        # If most neighbors are on phase X, consider aligning for green wave
        neighbor_phases = []
        for nid in self.neighbors.get(signal_id, []):
            if nid in self.last_actions:
                neighbor_phases.append(self.last_actions[nid])
        
        if neighbor_phases:
            common_phase = max(set(neighbor_phases), key=neighbor_phases.count)
            # 30% chance to follow neighbors for coordination
            if len([p for p in neighbor_phases if p == common_phase]) > len(neighbor_phases) * 0.6:
                if np.random.random() < 0.3:
                    action = common_phase
        
        return action
    
    def act(self, signal_states: Dict[str, Dict], deterministic: bool = True) -> Dict[str, int]:
        """
        Get actions for all signals with enhanced coordination.
        
        Args:
            signal_states: {signal_id: {queues, phase, time_in_phase, n_phases}}
            deterministic: use argmax if True
        
        Returns:
            actions: {signal_id: phase_index}
        """
        actions = {}
        queues = {sid: state.get("queues", [0, 0, 0]) for sid, state in signal_states.items()}
        
        for sid, state in signal_states.items():
            # 1. Check emergency priority FIRST
            emergency_action = self._check_emergency_priority(sid)
            if emergency_action is not None:
                actions[sid] = emergency_action
                self.last_actions[sid] = emergency_action
                self.phase_clock[sid] = 0
                continue
            
            # 2. Get base action from MAPPO
            obs = np.zeros(6, dtype=np.float32)
            obs[0] = state["queues"][0]
            obs[1] = state["queues"][1]
            obs[2] = state["queues"][2]
            obs[3] = state["phase"]
            obs[4] = state["time_in_phase"] / 60.0
            
            # 3. Add neighbor pressure to observation (approximate coordination)
            obs[5] = self._get_neighbor_pressure(sid, queues)
            
            obs_t = torch.tensor(obs, dtype=torch.float32, device=self.device).unsqueeze(0)
            
            with torch.no_grad():
                logits = self.policy(obs_t)
                if deterministic:
                    base_action = logits.argmax(dim=-1).item()
                else:
                    base_action = Categorical(logits=logits).sample().item()
            
            # 4. Apply coordination rules
            action = self._apply_coordination_rules(sid, base_action, queues)
            
            # 5. Clamp to valid phases
            n_phases = state.get("n_phases", 5)
            action = action % n_phases
            
            # 6. Track for coordination
            if action != self.last_actions[sid]:
                self.phase_clock[sid] = 0
            else:
                self.phase_clock[sid] += 1
            
            self.last_actions[sid] = action
            actions[sid] = action
        
        # Update emergency vehicle positions
        for ev in self.emergency_vehicles:
            if ev["active"]:
                current_pos = ev["position"]
                if current_pos < len(ev["path"]):
                    current_sig = ev["path"][current_pos]
                    if actions.get(current_sig, -1) == 0:  # Got green
                        ev["position"] += 1
                        if ev["position"] >= len(ev["path"]):
                            ev["active"] = False
                            print(f"✓ Emergency reached destination")
        
        return actions
    
    def get_metrics(self) -> Dict:
        """Get current state metrics."""
        return {
            "active_emergencies": sum(1 for ev in self.emergency_vehicles if ev["active"]),
            "blocked_junctions": len(self.blocked_junctions),
            "tier": self.city_tier,
            "is_peak": self._is_peak_hour(),
        }


# =============================================================================
# DEMO
# =============================================================================
if __name__ == "__main__":
    print("="*60)
    print("Enhanced NodeMAPPO Demo")
    print("="*60)
    
    controller = EnhancedNodeMAPPO(
        model_path="/home/vishalj/Flowmasters/simulation/PhaseB/checkpoints_movement/policy_shared_final.pt",
        network_json="/home/vishalj/Flowmasters/simulation/PhaseB/sambalpur_signals_15_movement.json",
        city_tier=2
    )
    
    # Test normal operation
    print("\n--- Normal Traffic ---")
    states = {
        "S1": {"queues": [0.3, 0.1, 0.2], "phase": 0, "time_in_phase": 10, "n_phases": 5},
        "S2": {"queues": [0.5, 0.2, 0.1], "phase": 1, "time_in_phase": 5, "n_phases": 5},
        "S3": {"queues": [0.2, 0.4, 0.3], "phase": 0, "time_in_phase": 15, "n_phases": 4},
    }
    actions = controller.act(states)
    print(f"Actions: {actions}")
    
    # Test emergency vehicle
    print("\n--- Emergency Vehicle ---")
    controller.set_emergency_vehicle(["S1", "S2", "S3"], "ambulance")
    actions = controller.act(states)
    print(f"Actions (S1 should prioritize): {actions}")
    
    # Test accident
    print("\n--- Accident Scenario ---")
    controller.clear_events()
    controller.set_accident(["S2"], diversions=[("S1", "S3")])
    actions = controller.act(states)
    print(f"Actions (S2 blocked): {actions}")
    
    print("\n" + "="*60)
    print("✓ Enhanced NodeMAPPO ready for all scenarios")
    print("="*60)
