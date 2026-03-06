#!/usr/bin/env python3
"""
compare_three_methods.py

Three-way comparison of traffic control methods:
1. MAPPO (RL-based policy)
2. Traffic Optimization (SCOOT-style density-based)
3. Simple Fixed Time (equal cycle division)

Outputs:
  - eval_comparison/comparison_summary.csv
  - eval_comparison/comparison_timeseries.csv
  - eval_comparison/comparison_plot.png
  - eval_comparison/comparison_report.json
"""

import argparse
import json
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
from torch.distributions import Categorical

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork
from traffic_baselines import SimpleFixedTimeBaseline, TrafficOptimizationBaseline


# -------------------------
# PolicyNet (must match training)
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
    all_obs = []
    keys = []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def create_env(json_path, n_envs=8, seed=42):
    """Create environment with standard parameters."""
    return VectorizedTrafficEnv(
        json_path, n_envs=n_envs, seed=seed,
        min_green=8, max_green=60, yellow_time=3,
        base_demand_level=0.20,
        dynamic_demand=True, demand_variation_mode="cyclic",
        random_traffic_shocks=True, shock_probability=0.03,
        bursty_release=True, spillback_penalty=20.0,
        normalize_obs=True
    )


# -------------------------
# Evaluate a single method
# -------------------------
def evaluate_baseline(baseline, env, mvnet, steps=3600, method_name="baseline"):
    """Evaluate a baseline controller (simple_fixed or traffic_opt)."""
    baseline.reset()
    obs = env.reset()
    
    qs = []
    spills = []
    
    for t in range(steps):
        actions = baseline.act(obs)
        next_obs, reward_dict, done_dict, info = env.step(actions)
        obs = next_obs
        
        # Compute average queue
        arr, _ = flatten_obs(next_obs)
        q_vals = arr[:, 0:3]  # through, left, right queues
        avg_q = float(q_vals.sum() / q_vals.shape[0])
        qs.append(avg_q)
        
        # Spillback fraction
        sp_count = 0
        total_pairs = 0
        for e_idx in info:
            sp_map = info[e_idx].get("spillback", {})
            for sid in sp_map:
                total_pairs += 1
                if sp_map[sid]:
                    sp_count += 1
        spill_frac = float(sp_count) / float(total_pairs) if total_pairs > 0 else 0.0
        spills.append(spill_frac)
    
    qs = np.array(qs)
    spills = np.array(spills)
    
    return {
        "method": method_name,
        "mean_queue": float(qs.mean()),
        "max_queue": float(qs.max()),
        "steady_queue": float(qs[-600:].mean()) if len(qs) >= 600 else float(qs.mean()),
        "spillback_rate": float(spills.mean()),
        "queue_ts": qs,
        "spill_ts": spills
    }


def evaluate_mappo(policy, mvnet, env, device, steps=3600):
    """Evaluate trained MAPPO policy."""
    policy.eval()
    obs = env.reset()
    
    qs = []
    spills = []
    
    for t in range(steps):
        obs_arr, keys = flatten_obs(obs)
        obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=device)
        
        with torch.no_grad():
            logits = policy(obs_t)
            dist = Categorical(logits=logits)
            actions_tensor = dist.sample().cpu().numpy()
        
        # Build action dict
        actions = {}
        idx = 0
        for e, sid in keys:
            actions.setdefault(e, {})
            sig_obj = mvnet.signals[mvnet.id_to_index[sid]]
            local_nph = sig_obj.n_phases if sig_obj.n_phases > 0 else 1
            actions[e][sid] = int(int(actions_tensor[idx]) % local_nph)
            idx += 1
        
        next_obs, reward_dict, done_dict, info = env.step(actions)
        obs = next_obs
        
        # Compute average queue
        arr, _ = flatten_obs(next_obs)
        q_vals = arr[:, 0:3]
        avg_q = float(q_vals.sum() / q_vals.shape[0])
        qs.append(avg_q)
        
        # Spillback
        sp_count = 0
        total_pairs = 0
        for e_idx in info:
            sp_map = info[e_idx].get("spillback", {})
            for sid in sp_map:
                total_pairs += 1
                if sp_map[sid]:
                    sp_count += 1
        spill_frac = float(sp_count) / float(total_pairs) if total_pairs > 0 else 0.0
        spills.append(spill_frac)
    
    qs = np.array(qs)
    spills = np.array(spills)
    
    return {
        "method": "MAPPO",
        "mean_queue": float(qs.mean()),
        "max_queue": float(qs.max()),
        "steady_queue": float(qs[-600:].mean()) if len(qs) >= 600 else float(qs.mean()),
        "spillback_rate": float(spills.mean()),
        "queue_ts": qs,
        "spill_ts": spills
    }


# -------------------------
# Main comparison function
# -------------------------
def run_comparison(model_path, json_path, n_envs=8, episodes=3, steps=3600, device="cuda"):
    print("\n" + "="*60)
    print("THREE-WAY COMPARISON: MAPPO vs Traffic Opt vs Fixed Time")
    print("="*60 + "\n")
    
    mvnet = MovementNetwork(json_path)
    print(f"✓ Loaded network with {len(mvnet.signal_ids)} signals")
    
    # Create environment
    env = create_env(json_path, n_envs=n_envs)
    obs = env.reset()
    sample_signal = list(obs[0].keys())[0]
    obs_dim = len(obs[0][sample_signal])
    max_phases = max([s.n_phases if s.n_phases > 0 else 1 for s in mvnet.signals])
    
    # Load MAPPO policy
    print(f"\n📦 Loading MAPPO model from: {model_path}")
    state_dict = torch.load(model_path, map_location=device)
    
    # Detect architecture
    hidden_size = 256
    n_actions = max_phases
    if 'net.0.weight' in state_dict:
        hidden_size = int(state_dict['net.0.weight'].shape[0])
    if 'logits.weight' in state_dict:
        n_actions = int(state_dict['logits.weight'].shape[0])
    
    policy = PolicyNet(obs_dim, hidden=hidden_size, n_actions=n_actions).to(device)
    policy.load_state_dict(state_dict)
    print(f"✓ MAPPO model loaded (hidden={hidden_size}, actions={n_actions})")
    
    # Create baselines
    simple_fixed = SimpleFixedTimeBaseline(mvnet, cycle_time=60)
    traffic_opt = TrafficOptimizationBaseline(mvnet, cycle_time=60)
    print("✓ Baselines created")
    
    # Run evaluations
    all_results = {"MAPPO": [], "Traffic_Opt": [], "Simple_Fixed": []}
    all_ts = {"MAPPO": [], "Traffic_Opt": [], "Simple_Fixed": []}
    
    for ep in range(episodes):
        print(f"\n📊 Episode {ep+1}/{episodes}")
        
        # MAPPO
        print("  Evaluating MAPPO...", end=" ")
        mappo_result = evaluate_mappo(policy, mvnet, env, device, steps)
        all_results["MAPPO"].append(mappo_result)
        all_ts["MAPPO"].append(mappo_result["queue_ts"])
        print(f"mean_q={mappo_result['mean_queue']:.3f}")
        
        # Traffic Optimization
        print("  Evaluating Traffic Opt...", end=" ")
        traffic_result = evaluate_baseline(traffic_opt, env, mvnet, steps, "Traffic_Opt")
        all_results["Traffic_Opt"].append(traffic_result)
        all_ts["Traffic_Opt"].append(traffic_result["queue_ts"])
        print(f"mean_q={traffic_result['mean_queue']:.3f}")
        
        # Simple Fixed Time
        print("  Evaluating Simple Fixed...", end=" ")
        simple_result = evaluate_baseline(simple_fixed, env, mvnet, steps, "Simple_Fixed")
        all_results["Simple_Fixed"].append(simple_result)
        all_ts["Simple_Fixed"].append(simple_result["queue_ts"])
        print(f"mean_q={simple_result['mean_queue']:.3f}")
    
    # Aggregate results
    print("\n" + "="*60)
    print("AGGREGATED RESULTS (averaged over {} episodes)".format(episodes))
    print("="*60)
    
    summary = []
    for method in ["MAPPO", "Traffic_Opt", "Simple_Fixed"]:
        mean_q = np.mean([r["mean_queue"] for r in all_results[method]])
        max_q = np.mean([r["max_queue"] for r in all_results[method]])
        steady_q = np.mean([r["steady_queue"] for r in all_results[method]])
        spill_rate = np.mean([r["spillback_rate"] for r in all_results[method]])
        
        summary.append({
            "method": method,
            "mean_queue": mean_q,
            "max_queue": max_q,
            "steady_queue": steady_q,
            "spillback_rate": spill_rate
        })
        
        print(f"\n{method}:")
        print(f"  Mean Queue:     {mean_q:.3f}")
        print(f"  Max Queue:      {max_q:.3f}")
        print(f"  Steady Queue:   {steady_q:.3f}")
        print(f"  Spillback Rate: {spill_rate:.4f}")
    
    # Compute improvement
    simple_mean_q = summary[2]["mean_queue"]
    traffic_mean_q = summary[1]["mean_queue"]
    mappo_mean_q = summary[0]["mean_queue"]
    
    print("\n" + "-"*60)
    print("IMPROVEMENT ANALYSIS")
    print("-"*60)
    print(f"Traffic Opt vs Simple Fixed: {(simple_mean_q - traffic_mean_q)/simple_mean_q*100:.1f}% reduction")
    print(f"MAPPO vs Simple Fixed:       {(simple_mean_q - mappo_mean_q)/simple_mean_q*100:.1f}% reduction")
    print(f"MAPPO vs Traffic Opt:        {(traffic_mean_q - mappo_mean_q)/traffic_mean_q*100:.1f}% reduction")
    
    # Save outputs
    os.makedirs("eval_comparison", exist_ok=True)
    
    # Summary CSV
    df_summary = pd.DataFrame(summary)
    df_summary.to_csv("eval_comparison/comparison_summary.csv", index=False)
    
    # Timeseries CSV
    avg_ts = {}
    for method in ["MAPPO", "Traffic_Opt", "Simple_Fixed"]:
        avg_ts[method] = np.stack(all_ts[method]).mean(axis=0)
    
    steps_idx = np.arange(steps)
    df_ts = pd.DataFrame({
        "step": steps_idx,
        "MAPPO": avg_ts["MAPPO"],
        "Traffic_Opt": avg_ts["Traffic_Opt"],
        "Simple_Fixed": avg_ts["Simple_Fixed"]
    })
    df_ts.to_csv("eval_comparison/comparison_timeseries.csv", index=False)
    
    # Plot
    plt.figure(figsize=(12, 6))
    plt.plot(steps_idx, avg_ts["Simple_Fixed"], label="Simple Fixed Time", alpha=0.8, linewidth=1.5)
    plt.plot(steps_idx, avg_ts["Traffic_Opt"], label="Traffic Optimization", alpha=0.8, linewidth=1.5)
    plt.plot(steps_idx, avg_ts["MAPPO"], label="MAPPO (RL)", alpha=0.8, linewidth=1.5)
    plt.xlabel("Step (seconds)")
    plt.ylabel("Average Queue (veh-equivalents)")
    plt.title("Three-Way Comparison: Average Queue Over Time")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig("eval_comparison/comparison_plot.png", dpi=150)
    plt.close()
    
    # JSON report
    report = {
        "summary": summary,
        "improvement": {
            "traffic_opt_vs_simple": float((simple_mean_q - traffic_mean_q)/simple_mean_q*100),
            "mappo_vs_simple": float((simple_mean_q - mappo_mean_q)/simple_mean_q*100),
            "mappo_vs_traffic_opt": float((traffic_mean_q - mappo_mean_q)/traffic_mean_q*100)
        },
        "config": {
            "model_path": model_path,
            "json_path": json_path,
            "episodes": episodes,
            "steps": steps,
            "n_envs": n_envs
        }
    }
    with open("eval_comparison/comparison_report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    print("\n✅ Saved outputs to eval_comparison/")
    print("  - comparison_summary.csv")
    print("  - comparison_timeseries.csv")
    print("  - comparison_plot.png")
    print("  - comparison_report.json")
    
    return summary, avg_ts


# -------------------------
# CLI
# -------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Three-way comparison: MAPPO vs Traffic Opt vs Fixed Time")
    p.add_argument("--model", type=str, required=True, help="Path to trained MAPPO policy .pt file")
    p.add_argument("--json", type=str, default="sambalpur_signals_15_movement.json", help="Network JSON file")
    p.add_argument("--n_envs", type=int, default=8, help="Number of parallel environments")
    p.add_argument("--episodes", type=int, default=3, help="Number of evaluation episodes")
    p.add_argument("--steps", type=int, default=3600, help="Steps per episode")
    p.add_argument("--device", type=str, default="cuda", help="Device (cuda or cpu)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_comparison(
        model_path=args.model,
        json_path=args.json,
        n_envs=args.n_envs,
        episodes=args.episodes,
        steps=args.steps,
        device=args.device
    )
