#!/usr/bin/env python3
"""
eval_mappo.py - MAPPO Policy Evaluation

Evaluates a trained MAPPO policy on the traffic environment.

Usage:
    python eval_mappo.py --model checkpoints/policy_final.pt --episodes 5 --steps 3600
"""

import os
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
from torch.distributions import Categorical

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

RESULTS_DIR = "results"
os.makedirs(RESULTS_DIR, exist_ok=True)


class PolicyNet(nn.Module):
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


def flatten_obs(obs_dict):
    all_obs, keys = [], []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def evaluate(args):
    device = args.device

    print("=" * 60)
    print("MAPPO EVALUATION")
    print("=" * 60)
    print(f"Model: {args.model}")
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

    obs = env.reset()
    sample_signal = list(obs[0].keys())[0]
    obs_dim = len(obs[0][sample_signal])
    max_phases = max([s.n_phases if s.n_phases > 0 else 1 for s in mvnet.signals])

    # Load model
    state_dict = torch.load(args.model, map_location=device)
    hidden_size = 256
    n_actions = max_phases
    if 'net.0.weight' in state_dict:
        hidden_size = int(state_dict['net.0.weight'].shape[0])
    if 'logits.weight' in state_dict:
        n_actions = int(state_dict['logits.weight'].shape[0])

    policy = PolicyNet(obs_dim, hidden=hidden_size, n_actions=n_actions).to(device)
    policy.load_state_dict(state_dict)
    policy.eval()
    print(f"✓ Model loaded (hidden={hidden_size}, actions={n_actions})")

    all_queues_ts = []
    ep_mean_q, ep_max_q, ep_steady_q, ep_spill = [], [], [], []

    for ep in range(args.episodes):
        print(f"  Episode {ep + 1}/{args.episodes}...", end=" ")
        obs = env.reset()
        qs, spills = [], []

        for t in range(args.steps):
            obs_arr, keys = flatten_obs(obs)
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=device)

            with torch.no_grad():
                logits = policy(obs_t)
                dist = Categorical(logits=logits)
                actions_tensor = dist.sample().cpu().numpy()

            actions = {}
            idx = 0
            for e, sid in keys:
                actions.setdefault(e, {})
                local_nph = max(1, mvnet.signals[mvnet.id_to_index[sid]].n_phases)
                actions[e][sid] = int(actions_tensor[idx]) % local_nph
                idx += 1

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

    # Aggregate
    metrics = {
        "method": "MAPPO",
        "mean_queue": float(np.mean(ep_mean_q)),
        "max_queue": float(np.mean(ep_max_q)),
        "steady_queue": float(np.mean(ep_steady_q)),
        "spillback_rate": float(np.mean(ep_spill)),
    }

    avg_ts = np.stack(all_queues_ts).mean(axis=0)

    # Save
    df = pd.DataFrame([metrics])
    df.to_csv(f"{RESULTS_DIR}/mappo_summary.csv", index=False)

    np.save(f"{RESULTS_DIR}/mappo_queue_ts.npy", avg_ts)

    plt.figure(figsize=(10, 4))
    plt.plot(avg_ts, color='#27ae60', linewidth=1.5)
    plt.xlabel("Step (seconds)")
    plt.ylabel("Average Queue")
    plt.title("MAPPO: Queue Over Time")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{RESULTS_DIR}/mappo_queue.png", dpi=150)
    plt.close()

    print("\n" + "=" * 60)
    print("MAPPO RESULTS")
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
    p.add_argument("--model", type=str, default="checkpoints/policy_final.pt")
    p.add_argument("--n_envs", type=int, default=8)
    p.add_argument("--episodes", type=int, default=5)
    p.add_argument("--steps", type=int, default=3600)
    p.add_argument("--device", type=str, default="cuda")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    evaluate(args)
