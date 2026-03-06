#!/usr/bin/env python3
"""
evaluate_rl_movement.py

Evaluate a trained RL policy (movement-level) on the movement environment.
Produces the same metrics and outputs as evaluate_fixed_movement.py so
results are directly comparable.

Outputs:
  - eval_rl_movement_summary.csv
  - eval_rl_movement_timeseries.csv
  - eval_rl_queue_movement.png
  - eval_rl_movement_report.json
"""

import argparse
import json
import os
from copy import deepcopy

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
from torch.distributions import Categorical

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

# -------------------------
# PolicyNet (must match training net)
# -------------------------
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
        h = self.net(x)
        return self.logits(h)


# -------------------------
# Helpers
# -------------------------
def flatten_obs(obs_dict):
    """
    obs_dict[env][sid] = np.array(obs)
    => returns: (N, obs_dim), keys (list of (env_idx, sid))
    """
    all_obs = []
    keys = []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


# -------------------------
# Evaluation function
# -------------------------
def eval_rl(model_path, json_path="sambalpur_signals_15_movement.json",
            n_envs=8, episodes=5, steps=3600, device="cuda", hidden_size=None):
    print(f"\nEvaluating RL policy: {model_path}\nNetwork JSON: {json_path}")

    # Build MovementNetwork to read per-signal n_phases mapping
    mvnet = MovementNetwork(json_path)

    # Build env to get obs_dim and env behavior consistent with baseline
    env = VectorizedTrafficEnv(json_path, n_envs=n_envs,
                               min_green=8, max_green=60, yellow_time=3,
                               base_demand_level=0.20,
                               dynamic_demand=True, demand_variation_mode="cyclic",
                               random_traffic_shocks=True, shock_probability=0.03,
                               bursty_release=True, spillback_penalty=20.0,
                               normalize_obs=True)

    obs = env.reset()
    sample_signal = list(obs[0].keys())[0]
    obs_dim = len(obs[0][sample_signal])

    # Determine max phases used during training (policy output size)
    max_phases = max([s.n_phases if s.n_phases > 0 else 1 for s in mvnet.signals])
    n_actions = max(max_phases, 2)

    # Auto-detect hidden size and n_actions from checkpoint to handle different training configs
    state_dict = torch.load(model_path, map_location=device)
    
    # Infer hidden size from checkpoint (MUST happen before model creation)
    if hidden_size is None:
        # Debug: print available keys to help diagnose
        if 'net.0.weight' not in state_dict:
            print(f"Debug: Available state_dict keys: {list(state_dict.keys())[:10]}...")
        
        # Try multiple detection methods
        detected = False
        if 'net.0.weight' in state_dict:
            # Infer hidden size from first layer weight shape [hidden, obs_dim]
            hidden_size = int(state_dict['net.0.weight'].shape[0])
            print(f"✓ Detected hidden size from checkpoint (net.0.weight): {hidden_size}")
            detected = True
        elif 'logits.weight' in state_dict:
            # Fallback: infer from logits layer [n_actions, hidden]
            hidden_size = int(state_dict['logits.weight'].shape[1])
            print(f"✓ Detected hidden size from checkpoint (logits.weight): {hidden_size}")
            detected = True
        
        # Double-check: verify the detected size makes sense
        if detected and 'net.2.weight' in state_dict:
            # Verify second layer shape matches [hidden, hidden]
            layer2_shape = state_dict['net.2.weight'].shape
            if layer2_shape[0] != hidden_size or layer2_shape[1] != hidden_size:
                print(f"⚠ Warning: Detected hidden_size={hidden_size} but net.2.weight has shape {layer2_shape}")
                print(f"   This may indicate an issue with detection. Re-detecting...")
                # Re-detect from second layer
                hidden_size = int(layer2_shape[0])
                print(f"   Using hidden_size={hidden_size} from net.2.weight")
        else:
            # Fallback to default
            hidden_size = 256
            print(f"⚠ Could not detect hidden size, using default: {hidden_size}")
            print(f"   Available keys: {list(state_dict.keys())}")
    else:
        print(f"Using specified hidden size: {hidden_size}")
    
    # Infer n_actions from checkpoint if available (MUST happen before model creation)
    if 'logits.weight' in state_dict:
        checkpoint_n_actions = int(state_dict['logits.weight'].shape[0])
        print(f"✓ Detected n_actions from checkpoint: {checkpoint_n_actions}")
        n_actions = checkpoint_n_actions  # Always use checkpoint value to avoid mismatch
    else:
        print(f"⚠ Could not detect n_actions from checkpoint, using computed value: {n_actions}")
    
    print(f"\nCreating model with:")
    print(f"  - obs_dim: {obs_dim}")
    print(f"  - hidden_size: {hidden_size}")
    print(f"  - n_actions: {n_actions}\n")

    policy = PolicyNet(obs_dim, hidden=hidden_size, n_actions=n_actions).to(device)
    try:
        policy.load_state_dict(state_dict, strict=True)
        print("✓ Successfully loaded checkpoint\n")
    except RuntimeError as e:
        print(f"\n❌ Error loading checkpoint! Architecture mismatch detected.")
        print(f"\nError message: {str(e)}")
        print(f"\nDetected checkpoint structure:")
        if 'net.0.weight' in state_dict:
            print(f"  - Checkpoint hidden_size: {state_dict['net.0.weight'].shape[0]}")
        if 'logits.weight' in state_dict:
            print(f"  - Checkpoint n_actions: {state_dict['logits.weight'].shape[0]}")
        print(f"\nTrying to create model with:")
        print(f"  - hidden_size: {hidden_size}")
        print(f"  - n_actions: {n_actions}")
        print(f"\nTo fix this:")
        if 'net.0.weight' in state_dict:
            correct_hidden = state_dict['net.0.weight'].shape[0]
            print(f"  1. Use: python evaluate_rl_movement.py --model <path> --hidden {correct_hidden}")
        print(f"  2. Or check your training configuration to see what hidden size was used")
        raise
    
    policy.eval()

    queues_all_eps = []
    max_q_all_eps = []
    steady_q_all_eps = []
    spill_rates_all_eps = []

    # iterate episodes
    for ep in range(episodes):
        print(f" Episode {ep+1}/{episodes}")
        obs = env.reset()
        q_ts = []
        spill_ts = []

        for t in range(steps):
            obs_arr, keys = flatten_obs(obs)
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=device)

            with torch.no_grad():
                logits = policy(obs_t)
                dist = Categorical(logits=logits)
                actions_tensor = dist.sample().cpu().numpy()

            # Build action dict mapping flattened indices back to env & sid
            actions = {}
            idx = 0
            for e, sid in keys:
                actions.setdefault(e, {})
                # Map policy action to valid local phase using modulo
                sig_obj = mvnet.signals[mvnet.id_to_index[sid]]
                local_nph = sig_obj.n_phases if sig_obj.n_phases > 0 else 1
                actions[e][sid] = int(int(actions_tensor[idx]) % local_nph)
                idx += 1

            next_obs, reward_dict, done_dict, info = env.step(actions)

            # compute average queue from next_obs
            arr, _ = flatten_obs(next_obs)
            q_vals = arr[:, 0:4]  # q per directions
            total_q = q_vals.sum()
            avg_q = float(total_q / q_vals.shape[0])
            q_ts.append(avg_q)

            # spillback fraction
            spill_count = 0
            total_pairs = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    total_pairs += 1
                    if sp_map[sid]:
                        spill_count += 1
            spill_frac = float(spill_count) / float(total_pairs) if total_pairs > 0 else 0.0
            spill_ts.append(spill_frac)

            obs = next_obs

        q_ts = np.array(q_ts)
        spill_ts = np.array(spill_ts)

        mean_q = float(q_ts.mean())
        max_q = float(q_ts.max())
        steady_q = float(q_ts[-600:].mean()) if len(q_ts) >= 600 else float(q_ts.mean())
        mean_spill = float(spill_ts.mean())

        queues_all_eps.append(mean_q)
        max_q_all_eps.append(max_q)
        steady_q_all_eps.append(steady_q)
        spill_rates_all_eps.append(mean_spill)

        print(f"   mean_queue={mean_q:.3f}, max_queue={max_q:.3f}, steady_queue(last600)={steady_q:.3f}, spillback_rate={mean_spill:.3f}")

    # aggregate
    metrics = {
        "model": "rl_policy",
        "mean_queue": float(np.mean(queues_all_eps)),
        "max_queue": float(np.mean(max_q_all_eps)),
        "steady_queue": float(np.mean(steady_q_all_eps)),
        "spillback_rate": float(np.mean(spill_rates_all_eps)),
        "episodes": episodes,
        "steps_per_episode": steps
    }

    # timeseries average across episodes: re-run and collect full ts if needed
    # For parity with fixed evaluator we compute avg queue timeseries by re-running with fewer envs
    # Simpler: compute timeseries by running again with n_envs=1 per episode and averaging.
    avg_queue_ts = None
    avg_spill_ts = None
    # We'll run a short set to compute timeseries (single-run averaging across episodes)
    ts_runs = []
    ts_sp_runs = []
    for ep in range(episodes):
        obs = env.reset()
        q_ts = []
        sp_ts = []
        for t in range(steps):
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
                local_nph = mvnet.signals[mvnet.id_to_index[sid]].n_phases if mvnet.signals[mvnet.id_to_index[sid]].n_phases > 0 else 1
                actions[e][sid] = int(int(actions_tensor[idx]) % local_nph)
                idx += 1
            next_obs, reward_dict, done_dict, info = env.step(actions)
            arr, _ = flatten_obs(next_obs)
            q_vals = arr[:, 0:4]
            avg_q = float(q_vals.sum() / q_vals.shape[0])
            q_ts.append(avg_q)

            spill_count = 0
            total_pairs = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    total_pairs += 1
                    if sp_map[sid]:
                        spill_count += 1
            sp_ts.append(float(spill_count) / total_pairs if total_pairs > 0 else 0.0)

            obs = next_obs
        ts_runs.append(np.array(q_ts))
        ts_sp_runs.append(np.array(sp_ts))

    avg_queue_ts = np.stack(ts_runs, axis=0).mean(axis=0)
    avg_spill_ts = np.stack(ts_sp_runs, axis=0).mean(axis=0)

    timeseries = {
        "avg_queue_ts": avg_queue_ts,
        "avg_spill_ts": avg_spill_ts
    }

    # save outputs
    os.makedirs("eval_rl_outputs", exist_ok=True)

    # summary csv
    rows = []
    for k, v in metrics.items():
        if k == "model":
            continue
        rows.append({"model": metrics["model"], "metric": k, "value": v})
    df = pd.DataFrame(rows)
    df.to_csv("eval_rl_outputs/eval_rl_movement_summary.csv", index=False)

    # timeseries csv
    steps_idx = np.arange(len(timeseries["avg_queue_ts"]))
    df_ts = pd.DataFrame({
        "step": steps_idx,
        "avg_queue": timeseries["avg_queue_ts"],
        "avg_spillback_fraction": timeseries["avg_spill_ts"]
    })
    df_ts.to_csv("eval_rl_outputs/eval_rl_movement_timeseries.csv", index=False)

    # plot
    plt.figure()
    plt.plot(steps_idx, timeseries["avg_queue_ts"], label="RL policy")
    plt.xlabel("Step (seconds)")
    plt.ylabel("Average queue (veh-equivalents)")
    plt.title("RL Policy: Average Queue Over Time")
    plt.legend()
    plt.tight_layout()
    plt.savefig("eval_rl_outputs/eval_rl_queue_movement.png")
    plt.close()

    # json report
    report = {
        "metrics": metrics
    }
    with open("eval_rl_outputs/eval_rl_movement_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("\nSaved:")
    print("  eval_rl_outputs/eval_rl_movement_summary.csv")
    print("  eval_rl_outputs/eval_rl_movement_timeseries.csv")
    print("  eval_rl_outputs/eval_rl_queue_movement.png")
    print("  eval_rl_outputs/eval_rl_movement_report.json")

    return metrics, timeseries


# -------------------------
# CLI
# -------------------------
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--json", type=str, default="sambalpur_signals_15_movement.json")
    p.add_argument("--model", type=str, required=True, help="Path to saved policy .pt")
    p.add_argument("--n_envs", type=int, default=8)
    p.add_argument("--episodes", type=int, default=5)
    p.add_argument("--steps", type=int, default=3600)
    p.add_argument("--device", type=str, default="cuda")
    p.add_argument("--hidden", type=int, default=None, help="Hidden size (auto-detected from checkpoint if not specified)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    eval_rl(args.model, json_path=args.json, n_envs=args.n_envs,
            episodes=args.episodes, steps=args.steps, device=args.device,
            hidden_size=args.hidden)