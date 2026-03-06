#!/usr/bin/env python3
"""
traffic_env.py

Multi-agent, vectorized traffic environment for the Sambalpur 15-signal network.
Designed for MAPPO-style training, with Indian-traffic-inspired dynamics.

Supports curriculum-style config via kwargs:
- dynamic_demand (bool)
- demand_variation_mode ("none" | "cyclic")
- random_traffic_shocks (bool)
- shock_probability (float)
- bursty_release (bool)
- spillback_penalty (float)
- base_demand_level (float)
- switch_penalty (float)
- normalize_obs (bool)

Default timings are chosen to be roughly in the Indian 60–90 s cycle band:
- min_green = 20 s
- max_green = 60 s
- yellow_time = 3 s
"""

import json
import math
import random
from collections import defaultdict

import numpy as np


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def load_network(json_path: str):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def seed_everything(seed: int):
    random.seed(seed)
    np.random.seed(seed)


# ---------------------------------------------------------
# SambalpurNetwork: holds static graph from JSON
# ---------------------------------------------------------

class SambalpurNetwork:
    def __init__(self, json_path: str):
        self.signals = load_network(json_path)
        self.signal_ids = [s["signal_id"] for s in self.signals]
        self.id_to_index = {sid: i for i, sid in enumerate(self.signal_ids)}

        # Adjacency (upstream/downstream)
        self.downstream = {s["signal_id"]: [] for s in self.signals}
        self.upstream = {s["signal_id"]: [] for s in self.signals}

        for s in self.signals:
            sid = s["signal_id"]
            for link in s.get("downstream_links", []):
                tgt = link["signal"]
                dist = link.get("distance_m", 500.0)
                tt = link.get("travel_time_s", max(1.0, dist / 7.0))
                self.downstream[sid].append(
                    {"signal": tgt, "distance_m": dist, "travel_time_s": tt}
                )
                self.upstream.setdefault(tgt, [])
                self.upstream[tgt].append(
                    {"signal": sid, "distance_m": dist, "travel_time_s": tt}
                )

        # Entry signals: no upstream; Exit signals: no downstream
        self.entry_signals = [
            sid for sid in self.signal_ids if len(self.upstream.get(sid, [])) == 0
        ]
        self.exit_signals = [
            sid for sid in self.signal_ids if len(self.downstream.get(sid, [])) == 0
        ]

        # Approaches per signal (cardinal directions)
        self.approaches = {
            s["signal_id"]: s.get("approaches", ["N", "S", "E", "W"])
            for s in self.signals
        }

        # Approach -> phase mapping (simple 2-phase NS/EW)
        self.approach_to_phase = {}
        for sid in self.signal_ids:
            aps = self.approaches[sid]
            mapping = {}
            for a in aps:
                if a in ["N", "S"]:
                    mapping[a] = 0
                else:
                    mapping[a] = 1
            self.approach_to_phase[sid] = mapping

        # Arrival fractions for diversions / mid-block entries
        self.arrival_fraction = {
            s["signal_id"]: s.get("arrival_fraction_mean", 0.7)
            for s in self.signals
        }


# ---------------------------------------------------------
# TrafficEnvCore: single-city simulation
# ---------------------------------------------------------

class TrafficEnvCore:
    """
    Single Sambalpur-like city simulation.

    Agents: each signal (S1..S15) is an agent.
    Action per agent: 0 = keep phase, 1 = switch phase.

    Config flags for curriculum phases:
      - dynamic_demand: time-varying Poisson rate
      - demand_variation_mode: "none" | "cyclic"
      - random_traffic_shocks: occasional surges (Indian-style chaos)
      - shock_probability: per-step probability of shock
      - bursty_release: higher discharge early in green after long red
      - spillback_penalty: weight in reward for queues > capacity
      - switch_penalty: small penalty per switch to discourage thrashing
      - base_demand_level: overall demand scale
      - normalize_obs: scale obs features to nicer ranges

    Observation per signal (7-d vector):
        0: queue_N (possibly normalized)
        1: queue_E
        2: queue_S
        3: queue_W
        4: current_phase (0 or 1)
        5: time_in_phase / max_green
        6: predicted_arrivals_next_10s (possibly normalized)
    """

    def __init__(self,
                 network: SambalpurNetwork,
                 sim_step: float = 1.0,
                 min_green: int = 20,
                 max_green: int = 60,
                 yellow_time: int = 3,
                 max_queue_per_approach: int = 50,
                 base_demand_level: float = 0.20,
                 dynamic_demand: bool = False,
                 demand_variation_mode: str = "none",
                 random_traffic_shocks: bool = False,
                 shock_probability: float = 0.0,
                 bursty_release: bool = False,
                 spillback_penalty: float = 20.0,
                 switch_penalty: float = 0.2,
                 normalize_obs: bool = True,
                 seed: int = 42):

        self.net = network
        self.sim_step = sim_step
        self.min_green = min_green
        self.max_green = max_green
        self.yellow_time = yellow_time
        self.max_queue_per_approach = max_queue_per_approach
        self.base_demand_level = base_demand_level

        self.dynamic_demand = dynamic_demand
        self.demand_variation_mode = demand_variation_mode
        self.random_traffic_shocks = random_traffic_shocks
        self.shock_probability = shock_probability
        self.bursty_release = bursty_release
        self.spillback_penalty = spillback_penalty
        self.switch_penalty = switch_penalty
        self.normalize_obs = normalize_obs

        # For observation normalization
        self.obs_queue_scale = 50.0   # ~max queue per approach
        self.obs_pred_scale = 50.0    # rough scale for predicted arrivals

        seed_everything(seed)

        self.signal_ids = self.net.signal_ids
        self.n_signals = len(self.signal_ids)

        # Determine longest travel time for pipeline sizing
        self.max_travel_time = 0
        for sid in self.signal_ids:
            for link in self.net.downstream[sid]:
                self.max_travel_time = max(
                    self.max_travel_time, int(link["travel_time_s"]) + 1
                )
        if self.max_travel_time <= 0:
            self.max_travel_time = 60

        self._queues = None
        self._phase = None
        self._time_in_phase = None
        self._in_yellow = None
        self._yellow_remaining = None
        self._pipelines = None
        self._just_switched = None
        self._t = 0
        self._done = False

        self.reset()

    # ------------- core state init -------------
    def _init_state(self):
        self._queues = {
            sid: {a: 0.0 for a in ["N", "E", "S", "W"]}
            for sid in self.signal_ids
        }

        # Random small queues at start
        for sid in self.signal_ids:
            for a in self.net.approaches[sid]:
                self._queues[sid][a] = float(np.random.poisson(2))

        self._phase = {sid: np.random.randint(0, 2) for sid in self.signal_ids}
        self._time_in_phase = {sid: 0 for sid in self.signal_ids}
        self._in_yellow = {sid: False for sid in self.signal_ids}
        self._yellow_remaining = {sid: 0 for sid in self.signal_ids}

        self._pipelines = {
            sid: [0.0 for _ in range(self.max_travel_time)]
            for sid in self.signal_ids
        }

        # Track if a signal switched phase this step
        self._just_switched = {sid: False for sid in self.signal_ids}

        self._t = 0
        self._done = False

    def reset(self):
        self._init_state()
        return self._get_obs()

    # ------------- step -------------
    def step(self, actions):
        if self._done:
            raise RuntimeError("Call reset() before stepping a finished episode.")

        self._t += 1

        # Reset switch markers each step
        for sid in self.signal_ids:
            self._just_switched[sid] = False

        self._update_phases(actions)
        self._process_in_transit()
        self._spawn_exogenous_arrivals()
        self._discharge_queues()

        rewards, spillback_flags = self._compute_rewards()
        obs = self._get_obs()

        done_flag = (self._t >= 3600)  # 1-hour episode
        self._done = done_flag
        done_dict = {sid: done_flag for sid in self.signal_ids}

        info = {"spillback": spillback_flags}
        return obs, rewards, done_dict, info

    # --------- internals ----------
    def _update_phases(self, actions):
        for sid in self.signal_ids:
            act = actions.get(sid, 0)

            # Yellow: just count down, no change
            if self._in_yellow[sid]:
                self._yellow_remaining[sid] -= 1
                if self._yellow_remaining[sid] <= 0:
                    self._in_yellow[sid] = False
                    self._time_in_phase[sid] = 0
                else:
                    continue

            self._time_in_phase[sid] += 1
            force_switch = self._time_in_phase[sid] >= self.max_green

            # request-based or forced switch
            if (act == 1 and self._time_in_phase[sid] >= self.min_green) or force_switch:
                self._in_yellow[sid] = True
                self._yellow_remaining[sid] = self.yellow_time
                self._phase[sid] = 1 - self._phase[sid]
                self._time_in_phase[sid] = 0
                self._just_switched[sid] = True  # mark that this signal switched

    def _process_in_transit(self):
        for dst in self.signal_ids:
            pipe = self._pipelines[dst]
            arriving = pipe[0]
            # shift pipeline
            for i in range(self.max_travel_time - 1):
                pipe[i] = pipe[i + 1]
            pipe[-1] = 0.0

            if arriving > 0:
                aps = self.net.approaches[dst]
                if not aps:
                    continue
                share = arriving / len(aps)
                for a in aps:
                    self._queues[dst][a] += share

    def _time_of_day_factor(self):
        if not self.dynamic_demand:
            return 1.0
        if self.demand_variation_mode == "cyclic":
            # simple sinusoid over episode
            return 1.0 + 0.5 * math.sin(2 * math.pi * self._t / 1800.0)
        return 1.0

    def _spawn_exogenous_arrivals(self):
        tod_factor = self._time_of_day_factor()

        for sid in self.net.entry_signals:
            aps = self.net.approaches[sid]
            for a in aps:
                lam = self.base_demand_level * 0.6 * tod_factor
                if self.random_traffic_shocks and random.random() < self.shock_probability:
                    lam *= 2.0
                n = np.random.poisson(lam)
                self._queues[sid][a] += float(n)

    def _discharge_queues(self):
        for sid in self.signal_ids:
            if self._in_yellow[sid]:
                continue

            phase = self._phase[sid]
            aps = self.net.approaches[sid]
            a2ph = self.net.approach_to_phase[sid]

            for a in aps:
                if a2ph.get(a, 0) != phase:
                    continue

                q = self._queues[sid][a]
                if q <= 0:
                    continue

                base_cap = 0.35  # veh-eq/s
                if self.bursty_release and self._time_in_phase[sid] <= 3:
                    base_cap *= 1.5  # surge after long red

                noise = np.random.normal(1.0, 0.1)
                cap = max(0.1, base_cap * noise)

                discharged = min(q, cap * self.sim_step)
                self._queues[sid][a] -= discharged

                dlinks = self.net.downstream[sid]
                if not dlinks:
                    continue  # exit

                for link in dlinks:
                    tgt = link["signal"]
                    tt = max(1, int(round(link["travel_time_s"])))
                    frac = self.net.arrival_fraction.get(tgt, 0.7)
                    going = discharged * frac / len(dlinks)
                    if tt < len(self._pipelines[tgt]):
                        self._pipelines[tgt][tt - 1] += going

    def _compute_rewards(self):
        rewards = {}
        spillback_flags = {}

        for sid in self.signal_ids:
            q_sum = sum(self._queues[sid].values())
            spillback = any(
                self._queues[sid][a] > self.max_queue_per_approach
                for a in self.net.approaches[sid]
            )
            spillback_flags[sid] = spillback

            alpha = 1.0
            beta = self.spillback_penalty
            r = - (alpha * q_sum + beta * (1.0 if spillback else 0.0))

            # small penalty for switching, to discourage thrashing
            if self.switch_penalty > 0.0 and self._just_switched.get(sid, False):
                r -= self.switch_penalty

            rewards[sid] = r

        return rewards, spillback_flags

    def _get_obs(self):
        obs = {}
        horizon = min(10, self.max_travel_time)

        for sid in self.signal_ids:
            qN = self._queues[sid]["N"]
            qE = self._queues[sid]["E"]
            qS = self._queues[sid]["S"]
            qW = self._queues[sid]["W"]

            phase = self._phase[sid]
            t_norm = self._time_in_phase[sid] / float(self.max_green)
            pred_arrivals = sum(self._pipelines[sid][:horizon])

            if self.normalize_obs:
                qN_n = qN / self.obs_queue_scale
                qE_n = qE / self.obs_queue_scale
                qS_n = qS / self.obs_queue_scale
                qW_n = qW / self.obs_queue_scale
                pred_n = pred_arrivals / self.obs_pred_scale
            else:
                qN_n, qE_n, qS_n, qW_n = qN, qE, qS, qW
                pred_n = pred_arrivals

            obs_vec = np.array([
                qN_n, qE_n, qS_n, qW_n,
                float(phase),
                float(t_norm),
                float(pred_n)
            ], dtype=np.float32)

            obs[sid] = obs_vec

        return obs


# ---------------------------------------------------------
# VectorizedTrafficEnv: multiple city copies in parallel
# ---------------------------------------------------------

class VectorizedTrafficEnv:
    """
    Vectorized wrapper over multiple TrafficEnvCore instances.
    Allows passing phase-specific kwargs into each core env.
    """

    def __init__(self,
                 json_path: str,
                 n_envs: int = 8,
                 **core_kwargs):

        network = SambalpurNetwork(json_path)
        self.envs = [
            TrafficEnvCore(network,
                           seed=core_kwargs.get("seed", 42) + i,
                           **core_kwargs)
            for i in range(n_envs)
        ]
        self.n_envs = n_envs
        self.signal_ids = self.envs[0].signal_ids

    def reset(self):
        out = {}
        for i, env in enumerate(self.envs):
            out[i] = env.reset()
        return out

    def step(self, actions):
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