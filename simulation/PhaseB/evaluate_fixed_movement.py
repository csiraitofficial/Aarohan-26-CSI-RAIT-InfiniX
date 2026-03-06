#!/usr/bin/env python3
"""
evaluate_fixed_movement.py

Evaluate a pre-timed (fixed-time) movement-level signal plan on the movement-level
VectorizedTrafficEnv (traffic_env_movement.py + sambalpur_signals_15_movement.json).

Outputs:
  - eval_fixed_movement_summary.csv
  - eval_fixed_movement_timeseries.csv
  - eval_fixed_movement_queue.png
"""

import argparse
import os
import json
import math
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

# -----------------------------
# Helper: flatten obs
# -----------------------------
def flatten_obs(obs_dict):
    all_obs = []
    keys = []
    for e in obs_dict:
        for sid in obs_dict[e]:
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


# -----------------------------
# Fixed-time movement-level controller
# -----------------------------
class FixedTimeMovementController:
    """
    Pre-timed controller that selects a phase index for each signal.
    It uses:
      - explicit 'phase_duration' in JSON if present,
      - otherwise computes splits from turning ratios / movement weights.

    Behavior:
      - The controller maintains an internal per-signal clock and cycles phases according to durations.
      - It ignores real-time queues (pre-timed).
    """

    def __init__(self, network: MovementNetwork, cycle_time: int = 60, min_green: int = 8):
        """
        network: MovementNetwork instance (from traffic_env_movement)
        cycle_time: default cycle time (seconds) for signals without explicit phase durations
        min_green: minimum green to enforce
        """
        self.net = network
        self.cycle_time = cycle_time
        self.min_green = min_green

        # For each signal, compute per-phase duration list and initialize clock
        self.phase_durations = {}
        self.phase_clock = {}
        self.phase_index = {}  # current phase index for each signal

        for s in self.net.signals:
            sid = s.signal_id
            # If JSON provided per-phase 'preset_duration' use that
            durations = []
            if s.phases:
                preset_ok = True
                for p in s.phases:
                    d = p.get("preset_duration", None)
                    if d is None:
                        preset_ok = False
                        break
                if preset_ok:
                    durations = [max(self.min_green, int(p.get("preset_duration", self.min_green))) for p in s.phases]

            if not durations:
                # fallback: compute durations based on movement turning ratios or movement counts.
                # For each phase, compute a weight = sum of assumed demand for allowed movements.
                phase_weights = []
                for p in s.phases:
                    allowed = p.get("allowed_movements", [])
                    w = 0.0
                    for mid in allowed:
                        # approximate weight: through > right > left
                        mmeta = s.mov_map.get(mid, {})
                        mtype = mmeta.get("type", "through").lower()
                        if "through" in mtype:
                            w += 1.0
                        elif "right" in mtype:
                            w += 0.5
                        elif "left" in mtype:
                            w += 0.4
                        else:
                            w += 0.5
                    phase_weights.append(max(0.01, w))

                total_w = sum(phase_weights) if phase_weights else 1.0
                # allocate cycle_time proportionally (ensure min_green)
                durations = []
                for w in phase_weights:
                    dur = max(self.min_green, int(round(self.cycle_time * (w / total_w))))
                    durations.append(dur)

                # adjust sum to cycle_time by scaling/shrinking while respecting min_green
                sum_d = sum(durations)
                if sum_d != self.cycle_time and len(durations) > 0:
                    # simple proportional adjust
                    scale = float(self.cycle_time) / float(sum_d)
                    durations = [max(self.min_green, int(round(d * scale))) for d in durations]
                    # final small fix to match cycle_time by adding/subtracting to first phase
                    diff = self.cycle_time - sum(durations)
                    if abs(diff) > 0:
                        durations[0] = max(self.min_green, durations[0] + diff)

            if not durations:
                # fallback to a single-phase of cycle_time
                durations = [self.cycle_time]

            self.phase_durations[sid] = durations
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0

    def act(self, obs_dict):
        """
        obs_dict: environment observation dict as returned by VectorizedTrafficEnv.reset/step
                  shape: obs_dict[env_idx][signal_id] -> obs_vec
        We return actions for all envs: {env_idx: {signal_id: phase_index, ...}, ...}
        This controller is pre-timed and identical across env copies (no adaptation).
        """
        out = {}
        for e in obs_dict:
            out[e] = {}
            # For each signal, advance the clock and, if needed, switch phase based on preset durations
            for sid in self.net.signal_ids:
                # increment clock before checking (we assume each call is 1s)
                self.phase_clock[sid] += 1
                cur_idx = self.phase_index[sid]
                cur_dur = self.phase_durations[sid][cur_idx]
                if self.phase_clock[sid] >= cur_dur:
                    # move to next phase
                    next_idx = (cur_idx + 1) % len(self.phase_durations[sid])
                    self.phase_index[sid] = next_idx
                    self.phase_clock[sid] = 0
                out[e][sid] = int(self.phase_index[sid])
        return out


# -----------------------------
# Evaluation runner
# -----------------------------
def eval_fixed_movement(json_path: str,
                        n_envs: int = 8,
                        episodes: int = 5,
                        steps: int = 3600,
                        cycle_time: int = 60):
    """
    Run pre-timed controller across n_envs and episodes. Returns metrics and timeseries.
    """
    # Build env with "realistic" parameters similar to your realistic fixed baseline
    env = VectorizedTrafficEnv(json_path,
                               n_envs=n_envs,
                               min_green=8,
                               max_green=60,
                               yellow_time=3,
                               base_demand_level=0.20,
                               dynamic_demand=True,
                               demand_variation_mode="cyclic",
                               random_traffic_shocks=True,
                               shock_probability=0.03,
                               bursty_release=True,
                               spillback_penalty=20.0,
                               normalize_obs=True)

    # Build network object to help controller compute durations
    network = MovementNetwork(json_path)
    controller = FixedTimeMovementController(network, cycle_time=cycle_time, min_green=8)

    all_queues_ts = []
    all_spill_ts = []

    ep_mean_q = []
    ep_max_q = []
    ep_steady_q = []
    ep_spill = []

    for ep in range(episodes):
        print(f"Episode {ep+1}/{episodes}")
        obs = env.reset()

        episode_queues = []
        episode_spills = []

        for t in range(steps):
            # controller returns same fixed schedule for every env copy
            actions = controller.act(obs)
            next_obs, reward_dict, done_dict, info = env.step(actions)

            # compute average queue per agent from next_obs (obs vector layout: [t_q, l_q, r_q, phase, t_norm, pred])
            obs_arr, keys = flatten_obs(next_obs)
            # sum over movements-aggregated queues (t_q + l_q + r_q) per agent
            q_vals = obs_arr[:, 0:3]  # shape (num_agents, 3)
            total_queue = float(q_vals.sum())  # across all envs/signals/directions
            avg_queue_per_agent = total_queue / float(q_vals.shape[0])

            # compute spillback fraction from info
            spill_count = 0
            total_pairs = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    total_pairs += 1
                    if sp_map[sid]:
                        spill_count += 1
            spill_frac = float(spill_count) / float(total_pairs) if total_pairs > 0 else 0.0

            episode_queues.append(avg_queue_per_agent)
            episode_spills.append(spill_frac)

            obs = next_obs

        episode_queues = np.array(episode_queues)
        episode_spills = np.array(episode_spills)

        all_queues_ts.append(episode_queues)
        all_spill_ts.append(episode_spills)

        mean_q = float(episode_queues.mean())
        max_q = float(episode_queues.max())
        steady_q = float(episode_queues[-600:].mean()) if len(episode_queues) >= 600 else float(episode_queues.mean())
        mean_spill = float(episode_spills.mean())

        ep_mean_q.append(mean_q)
        ep_max_q.append(max_q)
        ep_steady_q.append(steady_q)
        ep_spill.append(mean_spill)

        print(f"  mean_queue={mean_q:.2f}, max_queue={max_q:.2f}, steady_queue(last600)={steady_q:.2f}, spillback_rate={mean_spill:.3f}")

    # stack for timeseries
    all_queues_ts = np.stack(all_queues_ts, axis=0)  # (episodes, steps)
    all_spill_ts = np.stack(all_spill_ts, axis=0)

    avg_queue_ts = all_queues_ts.mean(axis=0)
    avg_spill_ts = all_spill_ts.mean(axis=0)

    metrics = {
        "model": "fixed_time_movement",
        "mean_queue": float(np.mean(ep_mean_q)),
        "max_queue": float(np.mean(ep_max_q)),
        "steady_queue": float(np.mean(ep_steady_q)),
        "spillback_rate": float(np.mean(ep_spill)),
        "episodes": episodes,
        "steps_per_episode": steps
    }

    timeseries = {
        "avg_queue_ts": avg_queue_ts,
        "avg_spill_ts": avg_spill_ts
    }

    return metrics, timeseries


# -----------------------------
# CLI / Main
# -----------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=str, default="sambalpur_signals_15_movement.json")
    parser.add_argument("--n_envs", type=int, default=8)
    parser.add_argument("--episodes", type=int, default=5)
    parser.add_argument("--steps", type=int, default=3600)
    parser.add_argument("--cycle_time", type=int, default=60)
    args = parser.parse_args()

    os.makedirs("eval_movement_outputs", exist_ok=True)

    metrics, ts = eval_fixed_movement(json_path=args.json,
                                      n_envs=args.n_envs,
                                      episodes=args.episodes,
                                      steps=args.steps,
                                      cycle_time=args.cycle_time)

    # save summary CSV
    rows = []
    for k, v in metrics.items():
        if k == "model":
            continue
        rows.append({"model": metrics["model"], "metric": k, "value": v})
    df_summary = pd.DataFrame(rows)
    df_summary.to_csv("eval_movement_outputs/eval_fixed_movement_summary.csv", index=False)

    # timeseries CSV
    steps = np.arange(len(ts["avg_queue_ts"]))
    df_ts = pd.DataFrame({"step": steps, "avg_queue": ts["avg_queue_ts"], "avg_spillback_fraction": ts["avg_spill_ts"]})
    df_ts.to_csv("eval_movement_outputs/eval_fixed_movement_timeseries.csv", index=False)

    # plot
    plt.figure(figsize=(10, 4))
    plt.plot(steps, ts["avg_queue_ts"], label="Fixed-time movement baseline")
    plt.xlabel("Step (s)")
    plt.ylabel("Average queue (veh-eq per agent)")
    plt.title("Fixed-time movement baseline: Average queue over time")
    plt.legend()
    plt.tight_layout()
    plt.savefig("eval_movement_outputs/eval_fixed_movement_queue.png")
    plt.close()

    # print summary
    print("\n=== FIXED MOVEMENT SUMMARY ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")

    print("\nSaved outputs to eval_movement_outputs/")

if __name__ == "__main__":
    main()