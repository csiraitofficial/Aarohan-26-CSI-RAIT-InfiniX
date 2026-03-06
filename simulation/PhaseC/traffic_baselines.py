#!/usr/bin/env python3
"""
traffic_baselines.py - PhaseC

Three baseline controllers for comparison with MAPPO:
1. SimpleFixedTimeBaseline - Equal division (cycle_time / n_phases)
2. TrafficOptimizationBaseline - SCOOT-style density-based adaptive control
"""

import math
from typing import Dict, List
from traffic_env_movement import MovementNetwork, MovementSignal


# ============================================================================
# PHASE DEFINITIONS (ported from traffic-optimization.ts)
# ============================================================================

PHASES_4WAY = [
    {"movements": ["N_S", "S_N"], "description": "North-South Through"},
    {"movements": ["N_W", "S_E"], "description": "North-South Left Turns"},
    {"movements": ["N_E", "S_W"], "description": "North-South Right Turns"},
    {"movements": ["E_W", "W_E"], "description": "East-West Through"},
    {"movements": ["E_N", "W_S"], "description": "East-West Left Turns"},
    {"movements": ["E_S", "W_N"], "description": "East-West Right Turns"},
]

PHASES_T_NO_EAST = [
    {"movements": ["N_S", "S_N"], "description": "North-South Through"},
    {"movements": ["N_W", "S_W"], "description": "Turns to West"},
    {"movements": ["W_N", "W_S"], "description": "From West"},
]

PHASES_T_NO_NORTH = [
    {"movements": ["E_W", "W_E"], "description": "East-West Through"},
    {"movements": ["E_S", "W_S"], "description": "Turns to South"},
    {"movements": ["S_E", "S_W"], "description": "From South"},
]


def _get_phases_for_signal(sig: MovementSignal):
    approaches = set(sig.approaches)
    is_4way = len(approaches) == 4
    if is_4way:
        return PHASES_4WAY
    elif "E" not in approaches:
        return PHASES_T_NO_EAST
    elif "N" not in approaches:
        return PHASES_T_NO_NORTH
    else:
        return [{"movements": ["N_S", "S_N", "E_W", "W_E"], "description": "All Through"}]


# ============================================================================
# BASELINE 1: Simple Fixed Time (Equal Division)
# ============================================================================

class SimpleFixedTimeBaseline:
    """
    Simple pre-timed controller: cycle_time / n_phases for each phase.
    Ignores traffic conditions completely.
    """

    def __init__(self, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
        self.net = network
        self.cycle_time = cycle_time
        self.min_green = min_green
        self.phase_durations = {}
        self.phase_clock = {}
        self.phase_index = {}

        for s in self.net.signals:
            sid = s.signal_id
            n_phases = max(1, s.n_phases)
            duration = max(self.min_green, self.cycle_time // n_phases)
            durations = [duration] * n_phases
            diff = self.cycle_time - sum(durations)
            if diff != 0 and len(durations) > 0:
                durations[0] = max(self.min_green, durations[0] + diff)
            self.phase_durations[sid] = durations
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0

    def act(self, obs_dict):
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                self.phase_clock[sid] += 1
                cur_idx = int(self.phase_index[sid])
                dur = self.phase_durations[sid][cur_idx]
                if self.phase_clock[sid] >= dur:
                    self.phase_index[sid] = (cur_idx + 1) % len(self.phase_durations[sid])
                    self.phase_clock[sid] = 0
                out[e][sid] = int(self.phase_index[sid])
        return out

    def reset(self):
        for sid in self.net.signal_ids:
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0


# ============================================================================
# BASELINE 2: Traffic Optimization (SCOOT-style)
# ============================================================================

class TrafficOptimizationBaseline:
    """
    SCOOT-style density-based adaptive controller.
    Formulas:
    - saturation = min(1.5, total_queue / 100)
    - green_time = BASE_GREEN + (saturation * 30), clamped [15, 45]
    """

    BASE_GREEN_TIME = 15
    MAX_GREEN_TIME = 45

    def __init__(self, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
        self.net = network
        self.cycle_time = cycle_time
        self.min_green = min_green
        self.step_count = {}
        self.current_phase = {}
        for s in self.net.signals:
            sid = s.signal_id
            self.step_count[sid] = 0
            self.current_phase[sid] = 0

    def _get_queues_from_obs(self, obs_vec):
        through = float(obs_vec[0]) if len(obs_vec) > 0 else 0.0
        left = float(obs_vec[1]) if len(obs_vec) > 1 else 0.0
        right = float(obs_vec[2]) if len(obs_vec) > 2 else 0.0
        return {"through": through, "left": left, "right": right}

    def _calculate_green_time(self, queues: Dict[str, float]) -> int:
        total_queue = queues["through"] + queues["left"] + queues["right"]
        saturation = min(1.5, total_queue / 100.0)
        green_time = self.BASE_GREEN_TIME + (saturation * 30)
        return int(round(max(self.BASE_GREEN_TIME, min(self.MAX_GREEN_TIME, green_time))))

    def act(self, obs_dict):
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                sig = self.net.signals[self.net.id_to_index[sid]]
                obs_vec = obs_dict[e].get(sid, [0, 0, 0, 0, 0, 0])
                queues = self._get_queues_from_obs(obs_vec)
                green_time = self._calculate_green_time(queues)
                actual_n_phases = max(1, sig.n_phases)
                self.step_count[sid] += 1
                steps_per_phase = max(self.min_green, green_time)
                total_cycle = steps_per_phase * actual_n_phases
                phase_step = self.step_count[sid] % total_cycle
                calculated_phase = phase_step // steps_per_phase
                self.current_phase[sid] = int(calculated_phase) % actual_n_phases
                out[e][sid] = int(self.current_phase[sid])
        return out

    def reset(self):
        for sid in self.net.signal_ids:
            self.step_count[sid] = 0
            self.current_phase[sid] = 0


def create_baseline(name: str, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
    if name == "simple_fixed":
        return SimpleFixedTimeBaseline(network, cycle_time, min_green)
    elif name == "traffic_opt":
        return TrafficOptimizationBaseline(network, cycle_time, min_green)
    else:
        raise ValueError(f"Unknown baseline: {name}")
