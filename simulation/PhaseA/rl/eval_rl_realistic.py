#!/usr/bin/env python3
"""
evaluate_rl_only.py

Evaluates a trained RL policy (MAPPO-style) on the Sambalpur traffic environment.

Environment config matches train_mappo_realistic.py:
  - min_green=20, max_green=60, yellow_time=3
  - base_demand_level=0.20
  - dynamic_demand=True, cyclic variation
  - random_traffic_shocks=True, shock_probability=0.03
  - bursty_release=True
  - spillback_penalty=20.0
  - switch_penalty=0.2
  - normalize_obs=True

Metrics (NORMALIZED: multiply by 50 to approximate vehicle-equivalents):
  - mean_queue
  - max_queue
  - steady_queue (last 600s)
  - spillback_rate

Outputs:
  - eval_rl_summary.csv
  - eval_rl_timeseries.csv
"""

import argparse
import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical
import pandas as pd

from traffic_env import VectorizedTrafficEnv

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# -----------------------------
# Policy net (same as train_mappo_realistic)
# -----------------------------

class PolicyNet(nn.Module):
    def __init__(self, obs_dim, hidden=128, n_actions=2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
        )
        self.logits = nn.Linear(hidden, n_actions)

    def forward(self, x):
        h = self.net(x)
        return self.logits(h)


# -----------------------------
# Helpers
# -----------------------------

def flatten_obs(obs_dict):
    """
    obs_dict[env][sid] -> obs_vec
    => ndarray [N_agents, obs_dim], keys list[(env_idx, sid)]
    """
    all_obs = []
    keys = []
    for e in obs_dict:
        for sid in obs_dict[e]:
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def summarize_episodes(queues_ts_all, spills_ts_all):
    """
    queues_ts_all: list of np.array [steps] per episode
    spills_ts_all: same
    """
    ep_mean = []
    ep_max = []
    ep_steady = []
    ep_spill = []

    for q, s in zip(queues_ts_all, spills_ts_all):
        mean_q = float(q.mean())
        max_q = float(q.max())
        if len(q) >= 600:
            steady_q = float(q[-600:].mean())
        else:
            steady_q = mean_q
        mean_spill = float(s.mean())

        ep_mean.append(mean_q)
        ep_max.append(max_q)
        ep_steady.append(steady_q)
        ep_spill.append(mean_spill)

    metrics = {
        "mean_queue": float(np.mean(ep_mean)),
        "max_queue": float(np.mean(ep_max)),
        "steady_queue": float(np.mean(ep_steady)),
        "spillback_rate": float(np.mean(ep_spill)),
        "episodes": len(queues_ts_all),
        "steps_per_episode": len(queues_ts_all[0]) if len(queues_ts_all) > 0 else 0,
    }
    return metrics


# -----------------------------
# Main eval
# -----------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=str,
        default="checkpoints_realistic/policy_final.pt",
        help="Path to trained RL policy checkpoint"
    )
    parser.add_argument(
        "--json",
        type=str,
        default="sambalpur_signals_15.json",
        help="Path to network JSON"
    )
    parser.add_argument(
        "--n_envs",
        type=int,
        default=8,
        help="Number of parallel envs"
    )
    parser.add_argument(
        "--episodes",
        type=int,
        default=5,
        help="Episodes to evaluate"
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=3600,
        help="Steps per episode"
    )
    args = parser.parse_args()

    # Env kwargs MUST match training + fixed baseline
    env_kwargs = dict(
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
        switch_penalty=0.2,
        normalize_obs=True,
    )

    # Build temp env to get obs_dim
    temp_env = VectorizedTrafficEnv(args.json, n_envs=1, **env_kwargs)
    temp_obs = temp_env.reset()
    sample_signal = list(temp_obs[0].keys())[0]
    obs_dim = len(temp_obs[0][sample_signal])

    # Load policy
    policy = PolicyNet(obs_dim).to(DEVICE)
    state_dict = torch.load(args.model, map_location=DEVICE)
    policy.load_state_dict(state_dict)
    policy.eval()

    # Real eval env
    env = VectorizedTrafficEnv(args.json, n_envs=args.n_envs, **env_kwargs)

    queues_ts_all = []
    spills_ts_all = []

    for ep in range(args.episodes):
        print(f"[RL] Episode {ep+1}/{args.episodes}")
        obs = env.reset()
        ep_q = []
        ep_s = []

        for t in range(args.steps):
            obs_arr, keys = flatten_obs(obs)
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=DEVICE)

            with torch.no_grad():
                logits = policy(obs_t)
                dist = Categorical(logits=logits)
                actions_t = dist.sample()

            actions = actions_t.cpu().numpy()

            # rebuild action dict
            actions_dict = {}
            idx = 0
            for e, sid in keys:
                actions_dict.setdefault(e, {})
                actions_dict[e][sid] = int(actions[idx])
                idx += 1

            next_obs, reward_dict, done_dict, info = env.step(actions_dict)

            # Compute average queue (normalized)
            q_vals = obs_arr[:, 0:4]  # N_agents x 4
            total_q = q_vals.sum()
            avg_q = total_q / q_vals.shape[0]

            # Spillback fraction
            spill_count = 0
            total_pairs = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    total_pairs += 1
                    if sp_map[sid]:
                        spill_count += 1
            spill_frac = spill_count / total_pairs if total_pairs > 0 else 0.0

            ep_q.append(avg_q)
            ep_s.append(spill_frac)

            obs = next_obs

        queues_ts_all.append(np.array(ep_q))
        spills_ts_all.append(np.array(ep_s))

    metrics = summarize_episodes(queues_ts_all, spills_ts_all)
    metrics["model"] = "rl_policy"

    print("\n=== RL POLICY SUMMARY (NORMALIZED QUEUES) ===")
    print(f"model: {metrics['model']}")
    print(f"mean_queue: {metrics['mean_queue']:.6f}")
    print(f"max_queue: {metrics['max_queue']:.6f}")
    print(f"steady_queue: {metrics['steady_queue']:.6f}")
    print(f"spillback_rate: {metrics['spillback_rate']:.6f}")
    print(f"episodes: {metrics['episodes']}")
    print(f"steps_per_episode: {metrics['steps_per_episode']}")

    # Approximate raw queues (veh-equivalents)
    mean_raw = metrics["mean_queue"] * 50.0
    steady_raw = metrics["steady_queue"] * 50.0
    print("\nApprox raw (veh-equivalents, queue * 50):")
    print(f"mean_queue_raw: {mean_raw:.2f}")
    print(f"steady_queue_raw: {steady_raw:.2f}")

    # Save summary CSV
    rows = []
    for k, v in metrics.items():
        if k == "model":
            continue
        rows.append({"model": metrics["model"], "metric": k, "value": v})
    df_sum = pd.DataFrame(rows)
    df_sum.to_csv("eval_rl_summary.csv", index=False)

    # Save time series CSV
    # average across episodes at each step
    queues_ts_all = np.stack(queues_ts_all, axis=0)   # [episodes, steps]
    spills_ts_all = np.stack(spills_ts_all, axis=0)   # [episodes, steps]
    avg_q_ts = queues_ts_all.mean(axis=0)
    avg_spill_ts = spills_ts_all.mean(axis=0)

    steps = np.arange(len(avg_q_ts))
    df_ts = pd.DataFrame({
        "step": steps,
        "avg_queue": avg_q_ts,
        "avg_spillback_fraction": avg_spill_ts
    })
    df_ts.to_csv("eval_rl_timeseries.csv", index=False)

    print("\nSaved:")
    print("  eval_rl_summary.csv")
    print("  eval_rl_timeseries.csv")


if __name__ == "__main__":
    main()