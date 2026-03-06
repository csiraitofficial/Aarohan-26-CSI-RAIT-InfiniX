#!/usr/bin/env python3
"""
traffic_env_movement.py

Movement-level traffic environment for Sambalpur 15-signal network.
Reads a movement-level JSON (sambalpur_signals_15_movement.json) where each signal
explicitly lists movements and phases.

API:
    env = VectorizedTrafficEnv("sambalpur_signals_15_movement.json", n_envs=8, **kwargs)
    obs = env.reset()
    actions = {env_idx: {signal_id: phase_index, ...}, ...}
    next_obs, rewards, dones, info = env.step(actions)

Observation (per signal) -> numpy.float32 vector of length 6:
    0: through_queue_norm (or absolute if normalize_obs=False)
    1: left_queue_norm
    2: right_queue_norm
    3: current_phase_index (0..P-1)
    4: time_in_phase / max_green
    5: predicted_arrivals_next_10s_norm

This environment is aggregate (not microscopic). Vehicles are "vehicle-equivalents".
"""

import json
import math
import random
from copy import deepcopy
from typing import Dict, List

import numpy as np

# -----------------------------
# Helpers
# -----------------------------


def load_network(json_path: str):
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def seed_everything(seed: int):
    random.seed(seed)
    np.random.seed(seed)


# -----------------------------
# Network structure
# -----------------------------


class MovementSignal:
    """
    Representation for a single signal loaded from JSON.
    """

    def __init__(self, raw: dict):
        self.signal_id = raw["signal_id"]
        self.lat = raw.get("lat")
        self.lon = raw.get("lon")
        self.junction_type = raw.get("junction_type", "4way")
        self.approaches = raw.get("approaches", ["N", "E", "S", "W"])

        # movements: list of {id, from, to, type}
        self.movements = raw.get("movements", [])

        # Map movement id -> movement meta
        self.mov_map = {m["id"]: m for m in self.movements}

        # phases: each phase lists allowed_movements (movement ids)
        self.phases = raw.get("phases", [])
        # For convenience, number of phases
        self.n_phases = len(self.phases)

        # turning ratios: approach -> {to_dir: fraction}
        self.turning_ratios = raw.get("turning_ratios", {})

        # downstream links from this signal (same schema as earlier)
        self.downstream_links = raw.get("downstream_links", [])

        # arrival fraction (losses/diversions)
        self.arrival_fraction_mean = float(raw.get("arrival_fraction_mean", 0.7))


class MovementNetwork:
    def __init__(self, json_path: str):
        raw = load_network(json_path)
        self.signals_raw = raw
        self.signals: List[MovementSignal] = [MovementSignal(s) for s in raw]
        self.signal_ids = [s.signal_id for s in self.signals]
        self.id_to_index = {sid: i for i, sid in enumerate(self.signal_ids)}

        # adjacency lists
        self.downstream = {s.signal_id: [] for s in self.signals}
        self.upstream = {s.signal_id: [] for s in self.signals}

        for s in self.signals:
            sid = s.signal_id
            for link in s.downstream_links:
                tgt = link["signal"]
                dist = link.get("distance_m", 500.0)
                tt = link.get("travel_time_s", max(1.0, dist / 7.0))
                self.downstream[sid].append({"signal": tgt,
                                             "distance_m": dist,
                                             "travel_time_s": tt})
                self.upstream.setdefault(tgt, [])
                self.upstream[tgt].append({"signal": sid,
                                           "distance_m": dist,
                                           "travel_time_s": tt})

        self.entry_signals = [sid for sid in self.signal_ids if len(self.upstream.get(sid, [])) == 0]
        self.exit_signals = [sid for sid in self.signal_ids if len(self.downstream.get(sid, [])) == 0]

        # categorize movements by type for each signal (useful for obs)
        # for each signal: movement_id -> type ('through'|'left'|'right'|other)
        self.movement_type = {}
        for s in self.signals:
            mtypes = {}
            for m in s.movements:
                typ = m.get("type", "through")
                # normalize names: use 'left','right','through'
                if typ is None:
                    mt = "through"
                elif typ.lower() in ("left", "left_turn"):
                    mt = "left"
                elif typ.lower() in ("right", "right_turn"):
                    mt = "right"
                else:
                    mt = "through"
                mtypes[m["id"]] = mt
            self.movement_type[s.signal_id] = mtypes


# -----------------------------
# TrafficEnvCore (movement-level)
# -----------------------------


class TrafficEnvCore:
    """
    Movement-level traffic environment for a single city copy.

    Configurable kwargs:
      - sim_step: seconds per step
      - min_green, max_green, yellow_time
      - base_demand_level (Poisson lambda scale for exogenous arrivals)
      - bursty_release, dynamic_demand, demand_variation_mode
      - random_traffic_shocks, shock_probability
      - max_queue_per_movement
      - spillback_penalty, switch_penalty
      - normalize_obs (bool)
      - obs_queue_scale, obs_pred_scale
    """

    def __init__(self,
                 network: MovementNetwork,
                 sim_step: float = 1.0,
                 min_green: int = 8,
                 max_green: int = 60,
                 yellow_time: int = 3,
                 base_demand_level: float = 0.2,
                 bursty_release: bool = False,
                 dynamic_demand: bool = False,
                 demand_variation_mode: str = "none",
                 random_traffic_shocks: bool = False,
                 shock_probability: float = 0.0,
                 max_queue_per_movement: int = 100,
                 spillback_penalty: float = 20.0,
                 switch_penalty: float = 0.2,
                 normalize_obs: bool = True,
                 obs_queue_scale: float = 50.0,
                 obs_pred_scale: float = 50.0,
                 seed: int = 42):

        self.net = network
        self.sim_step = sim_step
        self.min_green = min_green
        self.max_green = max_green
        self.yellow_time = yellow_time
        self.base_demand_level = base_demand_level

        self.bursty_release = bursty_release
        self.dynamic_demand = dynamic_demand
        self.demand_variation_mode = demand_variation_mode
        self.random_traffic_shocks = random_traffic_shocks
        self.shock_probability = shock_probability

        self.max_queue_per_movement = max_queue_per_movement
        self.spillback_penalty = spillback_penalty
        self.switch_penalty = switch_penalty

        self.normalize_obs = normalize_obs
        self.obs_queue_scale = float(obs_queue_scale) if obs_queue_scale > 0 else 50.0
        self.obs_pred_scale = float(obs_pred_scale) if obs_pred_scale > 0 else 50.0

        seed_everything(seed)

        # convenience holders
        self.signal_ids = self.net.signal_ids
        self.n_signals = len(self.signal_ids)

        # Determine longest travel time across all links
        self.max_travel_time = 0
        for sid in self.signal_ids:
            for link in self.net.downstream.get(sid, []):
                try:
                    tt_val = int(link.get("travel_time_s", 0))
                except Exception:
                    tt_val = 0
                self.max_travel_time = max(self.max_travel_time, tt_val + 1)
        if self.max_travel_time <= 0:
            self.max_travel_time = 60

        # state containers
        # movement queues: dict[sid][movement_id] -> float
        self._queues = None

        # current phase index per signal (int 0..n_phases-1)
        self._phase = None
        # time in current phase (seconds)
        self._time_in_phase = None

        # yellow state (bool) and remaining time for each signal
        self._in_yellow = None
        self._yellow_remaining = None

        # pipelines: dict[dst_signal][delay_index] -> float (arrivals scheduled)
        self._pipelines = None

        # track if switched this step (for switch_penalty)
        self._just_switched = None

        # step counter
        self._t = 0
        self._done = False

        self.reset()

    # -------------
    def _init_state(self):
        # queues: initialize all movement queues to small random
        self._queues = {}
        for s in self.net.signals:
            sid = s.signal_id
            self._queues[sid] = {}
            for m in s.movements:
                # small initial queue, zero or one on average
                self._queues[sid][m["id"]] = float(np.random.poisson(1))

        # phases/time
        self._phase = {}
        for s in self.net.signals:
            sid = s.signal_id
            max_ph = max(1, s.n_phases)
            # if n_phases==0 default to phase 0
            self._phase[sid] = int(np.random.randint(0, max_ph))

        self._time_in_phase = {sid: 0 for sid in self.signal_ids}
        self._in_yellow = {sid: False for sid in self.signal_ids}
        self._yellow_remaining = {sid: 0 for sid in self.signal_ids}

        # pipelines: scheduled arrivals for each signal
        self._pipelines = {sid: [0.0 for _ in range(self.max_travel_time)] for sid in self.signal_ids}

        self._just_switched = {sid: False for sid in self.signal_ids}

        self._t = 0
        self._done = False

    def reset(self):
        self._init_state()
        return self._get_obs()

    # -------------
    def step(self, actions: Dict[str, int]):
        """
        actions: dict[signal_id] -> phase_index (int)
        """
        if self._done:
            raise RuntimeError("Call reset() before stepping after done.")

        self._t += 1
        # reset switch marker
        for sid in self.signal_ids:
            self._just_switched[sid] = False

        # 1) apply requested phase indices (subject to min_green / yellow)
        self._apply_actions(actions)

        # 2) advance pipelines -> arrivals added to movement queues
        self._process_pipelines()

        # 3) spawn exogenous arrivals at entry signals (Poisson)
        self._spawn_exogenous_arrivals()

        # 4) discharge movements allowed by current phase
        self._discharge_movements()

        # 5) compute reward & spillback info
        rewards, spillback_flags = self._compute_rewards()

        # 6) build observations
        obs = self._get_obs()

        done_flag = (self._t >= 3600)  # 1-hour episodes
        self._done = done_flag
        done_dict = {sid: done_flag for sid in self.signal_ids}

        info = {"spillback": spillback_flags}
        return obs, rewards, done_dict, info

    # -------------
    def _apply_actions(self, actions: Dict[str, int]):
        """
        Actions are direct phase indices. We enforce min_green, yellow_time and max_green.
        If a phase change is requested and allowed, we start yellow and flip phase immediately,
        blocking discharge while in yellow (simpler semantics).
        """
        for sid in self.signal_ids:
            requested = actions.get(sid, None)
            # handle yellow countdown
            if self._in_yellow[sid]:
                self._yellow_remaining[sid] -= 1
                if self._yellow_remaining[sid] <= 0:
                    self._in_yellow[sid] = False
                    self._time_in_phase[sid] = 0
                else:
                    # still yellow -> cannot accept new change this substep
                    continue

            self._time_in_phase[sid] += 1

            current_phase_idx = int(self._phase.get(sid, 0))
            max_g = self.max_green
            min_g = self.min_green

            # force switch if max green exceeded (safety)
            if self._time_in_phase[sid] >= max_g:
                # trigger switch to next phase (circular) to avoid starvation
                new_idx = (current_phase_idx + 1) % max(1, self._get_signal_phase_count(sid))
                do_switch = True
            else:
                do_switch = False
                new_idx = current_phase_idx
                if requested is not None:
                    try:
                        req_idx = int(requested)
                    except Exception:
                        req_idx = current_phase_idx
                    if req_idx != current_phase_idx and self._time_in_phase[sid] >= min_g:
                        # allow change to requested phase
                        new_idx = int(req_idx % max(1, self._get_signal_phase_count(sid)))
                        do_switch = True

            if do_switch:
                # enter yellow for safety
                self._in_yellow[sid] = True
                self._yellow_remaining[sid] = self.yellow_time
                # flip to new phase immediately (discharge blocked while in yellow)
                self._phase[sid] = new_idx
                self._time_in_phase[sid] = 0
                self._just_switched[sid] = True

    # -------------
    def _process_pipelines(self):
        """
        Move pipeline[0] -> arrivals into movement queues, shift pipelines left.
        Arrivals are not approach-specific; we distribute them into movements using turning ratios.
        """
        for dst in self.signal_ids:
            pipe = self._pipelines[dst]
            arriving = 0.0
            if len(pipe) > 0:
                arriving = pipe[0]
            # shift left
            if len(pipe) > 1:
                for i in range(self.max_travel_time - 1):
                    pipe[i] = pipe[i + 1]
            if len(pipe) >= 1:
                pipe[-1] = 0.0

            if arriving <= 0:
                continue

            # Distribute arriving vehicles across approaches according to relative approach volumes.
            # We do not have exact approach shares here, so distribute equally to movements grouped by 'from' approach.
            sig = self._get_signal_by_id(dst)
            if sig is None:
                continue

            # Build approach -> movements list
            app_to_movs = {}
            for m in sig.movements:
                frm = m.get("from", "NA")
                app_to_movs.setdefault(frm, []).append(m["id"])

            n_approaches = len(app_to_movs) if len(app_to_movs) > 0 else 1
            per_app = arriving / float(n_approaches)
            for app, mov_ids in app_to_movs.items():
                per_mov = per_app / float(len(mov_ids)) if len(mov_ids) > 0 else per_app
                for mid in mov_ids:
                    # safety: ensure queue key exists
                    if mid not in self._queues[dst]:
                        self._queues[dst][mid] = 0.0
                    self._queues[dst][mid] += per_mov

    # -------------
    def _time_of_day_factor(self):
        if not self.dynamic_demand:
            return 1.0
        if self.demand_variation_mode == "cyclic":
            return 1.0 + 0.6 * math.sin(2 * math.pi * self._t / 1800.0)
        return 1.0

    def _spawn_exogenous_arrivals(self):
        tod = self._time_of_day_factor()
        # spawn only at entry signals; distribute across movements by movement type proportion
        for sid in self.net.entry_signals:
            sig = self._get_signal_by_id(sid)
            if sig is None or not sig.movements:
                continue
            # collect movements by type
            type_to_movs = {"through": [], "left": [], "right": [], "other": []}
            for m in sig.movements:
                mtype = self.net.movement_type[sid].get(m["id"], "through")
                if mtype not in type_to_movs:
                    type_to_movs["other"].append(m["id"])
                else:
                    type_to_movs[mtype].append(m["id"])

            for mtype, movs in type_to_movs.items():
                if not movs:
                    continue
                # demand lambda per movement type: through > right > left (rough)
                if mtype == "through":
                    lam_base = 1.0
                elif mtype == "right":
                    lam_base = 0.4
                elif mtype == "left":
                    lam_base = 0.2
                else:
                    lam_base = 0.3
                lam = float(self.base_demand_level) * lam_base * tod
                if self.random_traffic_shocks and random.random() < self.shock_probability:
                    lam *= 2.0
                # Poisson arrivals per movement
                for mid in movs:
                    try:
                        n = np.random.poisson(lam)
                    except Exception:
                        n = 0
                    if mid not in self._queues[sid]:
                        self._queues[sid][mid] = 0.0
                    self._queues[sid][mid] += float(n)

    # -------------
    def _discharge_movements(self):
        """
        For each signal, discharge movements that are allowed in the current phase (and not during yellow).
        Discharged vehicles are pushed to downstream pipelines based on turning ratios.
        Capacity is per movement and depends on movement type.
        """
        for sid in self.signal_ids:
            if self._in_yellow[sid]:
                continue

            sig = self._get_signal_by_id(sid)
            if sig is None or sig.n_phases == 0:
                continue

            phase_idx = int(self._phase.get(sid, 0)) % max(1, sig.n_phases)
            allowed_movs = sig.phases[phase_idx].get("allowed_movements", []) if phase_idx < len(sig.phases) else []

            for mid in allowed_movs:
                q = float(self._queues[sid].get(mid, 0.0))
                if q <= 0.0:
                    continue

                # base saturation flow by movement type
                mtype = self.net.movement_type[sid].get(mid, "through")
                if mtype == "through":
                    base_cap = 0.35  # veh-eq / s
                elif mtype == "right":
                    base_cap = 0.25
                elif mtype == "left":
                    base_cap = 0.20
                else:
                    base_cap = 0.25

                # bursty release if configured and early in green
                if self.bursty_release and self._time_in_phase[sid] <= 3:
                    base_cap *= 1.4

                noise = np.random.normal(1.0, 0.1)
                cap = max(0.05, base_cap * noise)
                discharged = min(q, cap * self.sim_step)
                # subtract discharged
                self._queues[sid][mid] = max(0.0, self._queues[sid].get(mid, 0.0) - discharged)

                # Now route discharged vehicles to downstream signals
                mov_meta = sig.mov_map.get(mid, None)
                if mov_meta is None:
                    # no meta, vehicles exit network
                    continue

                # fraction that continues to network (arrival_fraction_mean)
                arrival_frac = sig.arrival_fraction_mean if hasattr(sig, "arrival_fraction_mean") else 0.7
                routed_total = discharged * arrival_frac
                if routed_total <= 0:
                    continue

                dlinks = self.net.downstream.get(sid, [])
                if not dlinks:
                    continue

                # distribute across downstream links evenly
                n_links = len(dlinks)
                per_link = routed_total / float(n_links) if n_links > 0 else 0.0
                for link in dlinks:
                    tgt = link.get("signal")
                    tt = max(1, int(round(link.get("travel_time_s", 1))))
                    if tgt not in self._pipelines:
                        continue
                    # schedule arrival safely within pipeline length
                    idx = tt - 1
                    if 0 <= idx < len(self._pipelines[tgt]):
                        self._pipelines[tgt][idx] += per_link
                    else:
                        # fallback: immediate add to target queues (even distribution)
                        target_sig = self._get_signal_by_id(tgt)
                        if target_sig is None or not target_sig.movements:
                            continue
                        per_mov = per_link / float(len(target_sig.movements))
                        for mid_t in target_sig.movements:
                            mid_id = mid_t.get("id")
                            if mid_id not in self._queues[tgt]:
                                self._queues[tgt][mid_id] = 0.0
                            self._queues[tgt][mid_id] += per_mov

    # -------------
    def _compute_rewards(self):
        """
        Returns per-signal reward (float) and spillback flags (bool).
        Reward penalizes queue lengths and heavy spillback, plus small switch penalty.
        """
        rewards = {}
        spillback = {}

        for sid in self.signal_ids:
            sig = self._get_signal_by_id(sid)
            if sig is None:
                rewards[sid] = 0.0
                spillback[sid] = False
                continue

            total_q = 0.0
            for mid in sig.movements:
                total_q += float(self._queues[sid].get(mid["id"], 0.0))

            # spillback if any movement queue exceeds threshold
            sb = any(self._queues[sid].get(mid["id"], 0.0) > self.max_queue_per_movement for mid in sig.movements)
            spillback[sid] = bool(sb)

            alpha = 1.0
            beta = float(self.spillback_penalty)
            r = - (alpha * total_q + beta * (1.0 if sb else 0.0))

            # discourage thrashing switches
            if self.switch_penalty > 0 and self._just_switched.get(sid, False):
                r -= float(self.switch_penalty)

            rewards[sid] = float(r)

        return rewards, spillback

    # -------------
    def _get_obs(self):
        """
        Build observation dict: obs[sid] = vector(6)
        vector:
            0: through_queue_norm
            1: left_queue_norm
            2: right_queue_norm
            3: current_phase_idx (float)
            4: time_in_phase / max_green
            5: predicted_arrivals_next_10s_norm
        """
        obs = {}
        horizon = min(10, self.max_travel_time)

        for sid in self.signal_ids:
            sig = self._get_signal_by_id(sid)
            if sig is None:
                # empty vector if signal unknown
                obs[sid] = np.zeros(6, dtype=np.float32)
                continue

            # aggregate movement queues by type
            through_q = 0.0
            left_q = 0.0
            right_q = 0.0
            for m in sig.movements:
                mid = m.get("id")
                mtype = self.net.movement_type.get(sid, {}).get(mid, "through")
                q = float(self._queues[sid].get(mid, 0.0))
                if mtype == "through":
                    through_q += q
                elif mtype == "left":
                    left_q += q
                elif mtype == "right":
                    right_q += q
                else:
                    through_q += q

            pred_arrivals = float(sum(self._pipelines[sid][:horizon])) if sid in self._pipelines else 0.0

            # normalise if required
            if self.normalize_obs:
                t_q = through_q / float(max(1.0, self.obs_queue_scale))
                l_q = left_q / float(max(1.0, self.obs_queue_scale))
                r_q = right_q / float(max(1.0, self.obs_queue_scale))
                p_a = pred_arrivals / float(max(1.0, self.obs_pred_scale))
            else:
                t_q, l_q, r_q, p_a = through_q, left_q, right_q, pred_arrivals

            phase_idx = float(self._phase.get(sid, 0))
            t_norm = float(self._time_in_phase.get(sid, 0)) / float(max(1.0, self.max_green))

            obs_vec = np.array([t_q, l_q, r_q, phase_idx, t_norm, p_a], dtype=np.float32)
            obs[sid] = obs_vec

        return obs

    # -------------
    # Utilities
    def _get_signal_by_id(self, sid: str) -> MovementSignal:
        idx = self.net.id_to_index.get(sid, None)
        if idx is None:
            return None
        return self.net.signals[idx]

    def _get_signal_phase_count(self, sid: str) -> int:
        sig = self._get_signal_by_id(sid)
        if sig is None:
            return 1
        return max(1, sig.n_phases)


# -----------------------------
# Vectorized wrapper (multiple env copies)
# -----------------------------


class VectorizedTrafficEnv:
    """
    Wrapper around multiple TrafficEnvCore instances for parallel training.
    """

    def __init__(self, json_path: str, n_envs: int = 8, seed: int = 42, **core_kwargs):
        self.network = MovementNetwork(json_path)
        self.n_envs = n_envs
        self.envs: List[TrafficEnvCore] = []
        for i in range(n_envs):
            # each env gets a slightly different seed
            kwargs = deepcopy(core_kwargs)
            kwargs.setdefault("seed", seed + i)
            env = TrafficEnvCore(self.network, **kwargs)
            self.envs.append(env)
        self.signal_ids = self.network.signal_ids

    def reset(self):
        out = {}
        for i, env in enumerate(self.envs):
            out[i] = env.reset()
        return out

    def step(self, actions: Dict[int, Dict[str, int]]):
        """
        actions: dict[env_idx] -> dict[signal_id] -> phase_index
        Returns:
            obs_out: dict[env_idx][sid] -> obs_vec
            rew_out: dict[env_idx][sid] -> float
            done_out: dict[env_idx][sid] -> bool
            info_out: dict[env_idx] -> {"spillback": {sid: bool}}
        """
        obs_out = {}
        rew_out = {}
        done_out = {}
        info_out = {}

        for i, env in enumerate(self.envs):
            env_actions = actions.get(i, {})
            o, r, d, info = env.step(env_actions)
            obs_out[i] = o
            rew_out[i] = r
            done_out[i] = d
            info_out[i] = info

        return obs_out, rew_out, done_out, info_out