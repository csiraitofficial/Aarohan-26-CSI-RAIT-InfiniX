#!/usr/bin/env python3
"""
evaluate_fixed_baseline.py

Evaluate a realistic Indian fixed-time (pre-timed) signal plan
on the Sambalpur VectorizedTrafficEnv.

Controller:
  - 2-phase NS/EW per signal
  - Per-signal NS/EW splits (arterial vs local)
  - Ignores real-time queues (pre-timed plan)

Environment:
  - min_green ~20s, max_green ~60s, yellow 3s
  - base_demand_level ~0.20 (busy but not insane)
  - mild dynamic/cyclic demand + occasional shocks

Outputs:
  - eval_fixed_summary.csv
  - eval_fixed_timeseries.csv
  - eval_fixed_queue.png
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from traffic_env import VectorizedTrafficEnv


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
# Fixed-time Indian-style controller
# -----------------------------

class FixedTimeIndianController:
    """
    Pre-timed 2-phase controller with per-signal NS/EW splits.

    Uses time_in_phase / max_green from observation to decide when
    to request a phase change.
    """

    def __init__(self, signal_ids):
        self.signal_ids = signal_ids

        # Rough classification: S1–S6 & S8–S12 as main corridor-ish,
        # others more local/balanced.
        self.signal_ns_fraction = {
            "S1": 0.65,
            "S2": 0.65,
            "S3": 0.60,
            "S4": 0.60,
            "S5": 0.60,
            "S6": 0.55,
            "S7": 0.50,
            "S8": 0.65,
            "S9": 0.65,
            "S10": 0.60,
            "S11": 0.60,
            "S12": 0.55,
            "S13": 0.50,
            "S14": 0.50,
            "S15": 0.50,
        }

    def act(self, obs_dict):
        """
        obs_dict[env_idx][sid] -> obs_vec

        obs_vec layout:
          0: qN
          1: qE
          2: qS
          3: qW
          4: phase (0/1)
          5: time_in_phase / max_green
          6: predicted_arrivals
        """
        actions_out = {}

        for e in obs_dict:
            actions_out[e] = {}
            for sid, vec in obs_dict[e].items():
                phase = int(round(float(vec[4])))
                t_norm = float(vec[5])

                ns_frac = self.signal_ns_fraction.get(sid, 0.5)
                ew_frac = 1.0 - ns_frac
                threshold = ns_frac if phase == 0 else ew_frac

                if t_norm >= threshold:
                    actions_out[e][sid] = 1
                else:
                    actions_out[e][sid] = 0

        return actions_out


# -----------------------------
# Evaluation
# -----------------------------

def eval_fixed(
    json_path="sambalpur_signals_15.json",
    n_envs=8,
    episodes=5,
    steps=3600
):
    """
    Run fixed-time controller and compute metrics:
      - mean_queue
      - max_queue
      - steady_queue (last 600s)
      - spillback_rate
    """
    # Env tuned for "busy but not insane" Indian conditions
    env = VectorizedTrafficEnv(
        json_path,
        n_envs=n_envs,
        min_green=20,
        max_green=60,
        yellow_time=3,
        base_demand_level=0.20,
        dynamic_demand=True,
        demand_variation_mode="cyclic",
        random_traffic_shocks=True,
        shock_probability=0.03,
        bursty_release=True,
        spillback_penalty=20.0,
    )

    controller = FixedTimeIndianController(env.signal_ids)

    all_queues_ts = []
    all_spill_ts = []

    ep_mean_queues = []
    ep_max_queues = []
    ep_steady_queues = []
    ep_spill_rates = []

    for ep in range(episodes):
        print(f"Episode {ep+1}/{episodes}")
        obs = env.reset()

        episode_queues = []
        episode_spills = []

        for t in range(steps):
            actions = controller.act(obs)
            next_obs, reward_dict, done_dict, info = env.step(actions)

            obs_arr, keys = flatten_obs(next_obs)
            q_vals = obs_arr[:, 0:4]
            total_queue = q_vals.sum()
            avg_queue_per_agent = total_queue / q_vals.shape[0]

            spill_count = 0
            total_pairs = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    total_pairs += 1
                    if sp_map[sid]:
                        spill_count += 1
            spill_frac = spill_count / total_pairs if total_pairs > 0 else 0.0

            episode_queues.append(avg_queue_per_agent)
            episode_spills.append(spill_frac)

            obs = next_obs

        episode_queues = np.array(episode_queues)
        episode_spills = np.array(episode_spills)

        all_queues_ts.append(episode_queues)
        all_spill_ts.append(episode_spills)

        mean_q = float(episode_queues.mean())
        max_q = float(episode_queues.max())
        steady_q = float(episode_queues[-600:].mean()) if len(episode_queues) >= 600 else mean_q
        mean_spill = float(episode_spills.mean())

        ep_mean_queues.append(mean_q)
        ep_max_queues.append(max_q)
        ep_steady_queues.append(steady_q)
        ep_spill_rates.append(mean_spill)

        print(f"  mean_queue={mean_q:.2f}, max_queue={max_q:.2f}, "
              f"steady_queue(last 600s)={steady_q:.2f}, "
              f"spillback_rate={mean_spill:.3f}")

    all_queues_ts = np.stack(all_queues_ts, axis=0)
    all_spill_ts = np.stack(all_spill_ts, axis=0)

    avg_queue_ts = all_queues_ts.mean(axis=0)
    avg_spill_ts = all_spill_ts.mean(axis=0)

    metrics = {
        "model": "fixed_time_baseline",
        "mean_queue": float(np.mean(ep_mean_queues)),
        "max_queue": float(np.mean(ep_max_queues)),
        "steady_queue": float(np.mean(ep_steady_queues)),
        "spillback_rate": float(np.mean(ep_spill_rates)),
        "episodes": episodes,
        "steps_per_episode": steps,
    }

    timeseries = {
        "avg_queue_ts": avg_queue_ts,
        "avg_spill_ts": avg_spill_ts
    }

    return metrics, timeseries


def main():
    metrics, ts = eval_fixed(
        json_path="sambalpur_signals_15.json",
        n_envs=8,
        episodes=5,
        steps=3600
    )

    print("\n=== FIXED-TIME SUMMARY ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")

    # Summary CSV
    rows = [
        {"model": metrics["model"], "metric": k, "value": v}
        for k, v in metrics.items() if k not in ["model"]
    ]
    df_summary = pd.DataFrame(rows)
    df_summary.to_csv("eval_fixed_summary.csv", index=False)

    # Time-series CSV
    steps = np.arange(len(ts["avg_queue_ts"]))
    df_ts = pd.DataFrame({
        "step": steps,
        "avg_queue": ts["avg_queue_ts"],
        "avg_spillback_fraction": ts["avg_spill_ts"]
    })
    df_ts.to_csv("eval_fixed_timeseries.csv", index=False)

    # Plot
    plt.figure()
    plt.plot(steps, ts["avg_queue_ts"])
    plt.xlabel("Step (seconds)")
    plt.ylabel("Average queue (veh-equivalents)")
    plt.title("Fixed-Time Baseline: Average Queue Over Time")
    plt.tight_layout()
    plt.savefig("eval_fixed_queue.png")
    plt.close()

    print("\nSaved:")
    print("  eval_fixed_summary.csv")
    print("  eval_fixed_timeseries.csv")
    print("  eval_fixed_queue.png")


if __name__ == "__main__":
    main()