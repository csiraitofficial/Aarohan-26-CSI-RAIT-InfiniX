#!/usr/bin/env python3
"""
eval_traffic_optimization.py - Traffic Optimization Baseline Evaluation

SCOOT-style density-based adaptive traffic controller.
Adjusts green time based on real-time queue saturation.

Formulas:
- saturation = min(1.5, total_queue / 100)
- green_time = BASE_GREEN + (saturation * 30), clamped [15, 45]

Usage:
    python eval_traffic_optimization.py --episodes 5 --steps 3600
"""

import os
import argparse
from typing import Dict
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

RESULTS_DIR = "results"
os.makedirs(RESULTS_DIR, exist_ok=True)


class TrafficOptimizationController:
    """
    SCOOT-style density-based adaptive traffic controller.
    Ported from FlowMasters-frontend-final/traffic-optimization.ts
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


def flatten_obs(obs_dict):
    all_obs, keys = [], []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def evaluate(args):
    print("=" * 60)
    print("TRAFFIC OPTIMIZATION EVALUATION")
    print("=" * 60)
    print(f"Episodes: {args.episodes}, Steps: {args.steps}")
    print("=" * 60 + "\n")

    mvnet = MovementNetwork(args.json)
    print(f"✓ Loaded network with {len(mvnet.signal_ids)} signals")

    env = VectorizedTrafficEnv(
        args.json, n_envs=args.n_envs,
        min_green=8, max_green=60, yellow_time=3,
        base_demand_level=0.20, dynamic_demand=True, demand_variation_mode="cyclic",
        random_traffic_shocks=True, shock_probability=0.03, bursty_release=True,
        spillback_penalty=20.0, normalize_obs=True
    )

    controller = TrafficOptimizationController(mvnet, cycle_time=args.cycle_time)

    all_queues_ts = []
    ep_mean_q, ep_max_q, ep_steady_q, ep_spill = [], [], [], []

    for ep in range(args.episodes):
        print(f"  Episode {ep + 1}/{args.episodes}...", end=" ")
        controller.reset()
        obs = env.reset()
        qs, spills = [], []

        for t in range(args.steps):
            actions = controller.act(obs)
            next_obs, _, _, info = env.step(actions)
            obs = next_obs

            arr, _ = flatten_obs(next_obs)
            avg_q = float(arr[:, 0:3].sum() / arr.shape[0])
            qs.append(avg_q)

            sp_count, total = 0, 0
            for e_idx in info:
                for sid, sp in info[e_idx].get("spillback", {}).items():
                    total += 1
                    if sp:
                        sp_count += 1
            spills.append(sp_count / total if total > 0 else 0.0)

        qs = np.array(qs)
        spills = np.array(spills)
        all_queues_ts.append(qs)

        ep_mean_q.append(float(qs.mean()))
        ep_max_q.append(float(qs.max()))
        ep_steady_q.append(float(qs[-600:].mean()) if len(qs) >= 600 else float(qs.mean()))
        ep_spill.append(float(np.mean(spills)))

        print(f"mean_q={ep_mean_q[-1]:.3f}")

    # Aggregate results
    metrics = {
        "method": "Traffic_Optimization",
        "mean_queue": float(np.mean(ep_mean_q)),
        "max_queue": float(np.mean(ep_max_q)),
        "steady_queue": float(np.mean(ep_steady_q)),
        "spillback_rate": float(np.mean(ep_spill)),
    }

    avg_ts = np.stack(all_queues_ts).mean(axis=0)

    # Save results
    df = pd.DataFrame([metrics])
    df.to_csv(f"{RESULTS_DIR}/traffic_optimization_summary.csv", index=False)

    np.save(f"{RESULTS_DIR}/traffic_optimization_queue_ts.npy", avg_ts)

    plt.figure(figsize=(10, 4))
    plt.plot(avg_ts, color='#f39c12', linewidth=1.5)
    plt.xlabel("Step (seconds)")
    plt.ylabel("Average Queue")
    plt.title("Traffic Optimization: Queue Over Time")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{RESULTS_DIR}/traffic_optimization_queue.png", dpi=150)
    plt.close()

    print("\n" + "=" * 60)
    print("TRAFFIC OPTIMIZATION RESULTS")
    print("=" * 60)
    print(f"Mean Queue:     {metrics['mean_queue']:.3f}")
    print(f"Max Queue:      {metrics['max_queue']:.3f}")
    print(f"Steady Queue:   {metrics['steady_queue']:.3f}")
    print(f"Spillback Rate: {metrics['spillback_rate']:.4f}")
    print("=" * 60)
    print(f"\nResults saved to: {RESULTS_DIR}/")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--json", type=str, default="sambalpur_signals_15_movement.json")
    p.add_argument("--n_envs", type=int, default=8)
    p.add_argument("--episodes", type=int, default=5)
    p.add_argument("--steps", type=int, default=3600)
    p.add_argument("--cycle_time", type=int, default=60)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    evaluate(args)
