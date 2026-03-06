#!/usr/bin/env python3
"""
traffic_baselines.py

Three baseline controllers for comparison with MAPPO:
1. SimpleFixedTimeBaseline - Equal division (cycle_time / n_phases)
2. TrafficOptimizationBaseline - SCOOT-style density-based adaptive control

Both use the same VectorizedTrafficEnv environment for fair comparison.
"""

import math
from typing import Dict, List
from traffic_env_movement import MovementNetwork, MovementSignal


# ============================================================================
# PHASE DEFINITIONS (ported from traffic-optimization.ts)
# ============================================================================

# 4-way junction phases (6 phases for all movements)
PHASES_4WAY = [
    {"movements": ["N_S", "S_N"], "description": "North-South Through"},
    {"movements": ["N_W", "S_E"], "description": "North-South Left Turns"},
    {"movements": ["N_E", "S_W"], "description": "North-South Right Turns"},
    {"movements": ["E_W", "W_E"], "description": "East-West Through"},
    {"movements": ["E_N", "W_S"], "description": "East-West Left Turns"},
    {"movements": ["E_S", "W_N"], "description": "East-West Right Turns"},
]

# T/Y junction (no East approach)
PHASES_T_NO_EAST = [
    {"movements": ["N_S", "S_N"], "description": "North-South Through"},
    {"movements": ["N_W", "S_W"], "description": "Turns to West"},
    {"movements": ["W_N", "W_S"], "description": "From West"},
]

# T/Y junction (no North approach)
PHASES_T_NO_NORTH = [
    {"movements": ["E_W", "W_E"], "description": "East-West Through"},
    {"movements": ["E_S", "W_S"], "description": "Turns to South"},
    {"movements": ["S_E", "S_W"], "description": "From South"},
]


def _get_phases_for_signal(sig: MovementSignal):
    """
    Determine appropriate phase definitions based on junction type and approaches.
    """
    approaches = set(sig.approaches)
    is_4way = len(approaches) == 4

    if is_4way:
        return PHASES_4WAY
    elif "E" not in approaches:
        return PHASES_T_NO_EAST
    elif "N" not in approaches:
        return PHASES_T_NO_NORTH
    else:
        # Default to simplified phases
        return [{"movements": ["N_S", "S_N", "E_W", "W_E"], "description": "All Through"}]


def _filter_movements_for_approaches(movements: List[str], approaches: set) -> List[str]:
    """Filter movements to only include valid approaches."""
    result = []
    for mov in movements:
        parts = mov.split("_")
        if len(parts) == 2:
            from_dir, to_dir = parts
            if from_dir in approaches and to_dir in approaches:
                result.append(mov)
    return result


# ============================================================================
# BASELINE 1: Simple Fixed Time (Equal Division)
# ============================================================================

class SimpleFixedTimeBaseline:
    """
    Simple pre-timed controller that divides cycle time equally among phases.
    Formula: phase_duration = cycle_time / n_phases
    
    This is the most basic baseline - completely ignores traffic conditions.
    """

    def __init__(self, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
        self.net = network
        self.cycle_time = cycle_time
        self.min_green = min_green

        # For each signal, compute equal phase durations
        self.phase_durations = {}  # sid -> list of durations
        self.phase_clock = {}      # sid -> current time in phase
        self.phase_index = {}      # sid -> current phase index

        for s in self.net.signals:
            sid = s.signal_id
            n_phases = max(1, s.n_phases)
            
            # Equal division: cycle_time / n_phases
            duration = max(self.min_green, self.cycle_time // n_phases)
            durations = [duration] * n_phases
            
            # Adjust to match cycle_time exactly
            diff = self.cycle_time - sum(durations)
            if diff != 0 and len(durations) > 0:
                durations[0] = max(self.min_green, durations[0] + diff)

            self.phase_durations[sid] = durations
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0

    def act(self, obs_dict):
        """
        Select phase for each signal based on fixed timing.
        obs_dict is ignored (pre-timed control).
        
        Returns: {env_idx: {signal_id: phase_index, ...}, ...}
        """
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                self.phase_clock[sid] += 1
                cur_idx = int(self.phase_index[sid])
                dur = self.phase_durations[sid][cur_idx]
                
                if self.phase_clock[sid] >= dur:
                    # Move to next phase
                    self.phase_index[sid] = (cur_idx + 1) % len(self.phase_durations[sid])
                    self.phase_clock[sid] = 0
                    
                out[e][sid] = int(self.phase_index[sid])
        return out

    def reset(self):
        """Reset controller state for new episode."""
        for sid in self.net.signal_ids:
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0


# ============================================================================
# BASELINE 2: Traffic Optimization (SCOOT-style Density-Based)
# ============================================================================

class TrafficOptimizationBaseline:
    """
    SCOOT-style density-based adaptive traffic controller.
    
    Ported from FlowMasters-frontend-final/traffic-optimization.ts
    
    Key features:
    - Dynamic green time based on queue saturation
    - Phase selection considers 4-way and T/Y junction types
    - Uses Webster's formula concepts for timing
    
    Formulas:
    - saturation = min(1.5, total_queue / 100)
    - green_time = BASE_GREEN + (saturation * 30), clamped to [15, 45]
    """

    # Constants (from traffic-optimization.ts)
    BASE_GREEN_TIME = 15  # Minimum green time (seconds)
    MAX_GREEN_TIME = 45   # Maximum green time (seconds)

    def __init__(self, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
        self.net = network
        self.cycle_time = cycle_time
        self.min_green = min_green

        # Per-signal state
        self.step_count = {}     # sid -> step counter for phase cycling
        self.current_phase = {}  # sid -> current phase index

        for s in self.net.signals:
            sid = s.signal_id
            self.step_count[sid] = 0
            self.current_phase[sid] = 0

    def _get_queues_from_obs(self, obs_vec):
        """
        Extract queue values from observation vector.
        obs_vec layout: [through_q, left_q, right_q, phase_idx, time_norm, pred_arrivals]
        """
        through = float(obs_vec[0]) if len(obs_vec) > 0 else 0.0
        left = float(obs_vec[1]) if len(obs_vec) > 1 else 0.0
        right = float(obs_vec[2]) if len(obs_vec) > 2 else 0.0
        return {"through": through, "left": left, "right": right}

    def _calculate_green_time(self, queues: Dict[str, float]) -> int:
        """
        Calculate dynamic green time using SCOOT formula.
        """
        total_queue = queues["through"] + queues["left"] + queues["right"]
        
        # Degree of saturation (0 to 1.5)
        saturation = min(1.5, total_queue / 100.0)
        
        # Calculate green time proportional to demand
        green_time = self.BASE_GREEN_TIME + (saturation * 30)
        green_time = max(self.BASE_GREEN_TIME, min(self.MAX_GREEN_TIME, green_time))
        
        return int(round(green_time))

    def act(self, obs_dict):
        """
        Select phase for each signal using density-based optimization.
        
        Returns: {env_idx: {signal_id: phase_index, ...}, ...}
        """
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                sig = self.net.signals[self.net.id_to_index[sid]]
                obs_vec = obs_dict[e].get(sid, [0, 0, 0, 0, 0, 0])
                
                # Get queue values from observation
                queues = self._get_queues_from_obs(obs_vec)
                
                # Calculate dynamic green time
                green_time = self._calculate_green_time(queues)
                
                # Get phases for this junction type
                phases = _get_phases_for_signal(sig)
                num_phases = len(phases)
                
                # Use signal's actual phases if available
                actual_n_phases = max(1, sig.n_phases)
                
                # Phase cycling based on calculated green time
                self.step_count[sid] += 1
                steps_per_phase = max(self.min_green, green_time)
                
                # Calculate which phase we should be in
                total_cycle = steps_per_phase * actual_n_phases
                phase_step = self.step_count[sid] % total_cycle
                calculated_phase = phase_step // steps_per_phase
                
                self.current_phase[sid] = int(calculated_phase) % actual_n_phases
                out[e][sid] = int(self.current_phase[sid])
                
        return out

    def reset(self):
        """Reset controller state for new episode."""
        for sid in self.net.signal_ids:
            self.step_count[sid] = 0
            self.current_phase[sid] = 0


# ============================================================================
# UTILITY FUNCTION
# ============================================================================

def create_baseline(name: str, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
    """
    Factory function to create baseline controllers.
    
    Args:
        name: One of 'simple_fixed', 'traffic_opt'
        network: MovementNetwork instance
        cycle_time: Default cycle time in seconds
        min_green: Minimum green time per phase
    
    Returns:
        Baseline controller instance
    """
    if name == "simple_fixed":
        return SimpleFixedTimeBaseline(network, cycle_time, min_green)
    elif name == "traffic_opt":
        return TrafficOptimizationBaseline(network, cycle_time, min_green)
    else:
        raise ValueError(f"Unknown baseline: {name}. Use 'simple_fixed' or 'traffic_opt'")


if __name__ == "__main__":
    # Quick sanity test
    import numpy as np
    from traffic_env_movement import VectorizedTrafficEnv
    
    json_path = "sambalpur_signals_15_movement.json"
    network = MovementNetwork(json_path)
    
    print("Testing baselines...")
    
    # Test SimpleFixedTimeBaseline
    simple = SimpleFixedTimeBaseline(network, cycle_time=60)
    print(f"✓ SimpleFixedTimeBaseline created with {len(network.signal_ids)} signals")
    
    # Test TrafficOptimizationBaseline
    traffic_opt = TrafficOptimizationBaseline(network, cycle_time=60)
    print(f"✓ TrafficOptimizationBaseline created with {len(network.signal_ids)} signals")
    
    # Quick run test
    env = VectorizedTrafficEnv(json_path, n_envs=2)
    obs = env.reset()
    
    simple_actions = simple.act(obs)
    traffic_opt_actions = traffic_opt.act(obs)
    
    print(f"✓ Simple Fixed actions: {list(simple_actions[0].values())[:3]}...")
    print(f"✓ Traffic Opt actions: {list(traffic_opt_actions[0].values())[:3]}...")
    print("\nAll baselines working correctly!")
