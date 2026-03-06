#!/usr/bin/env python3
"""
quick_compare.py - Quick comparison of existing PhaseB MAPPO with baselines

Uses the existing trained model from PhaseB and compares with:
1. Simple Fixed Time
2. Traffic Optimization (SCOOT-style)

Run from PhaseC directory:
    python quick_compare.py
"""

import os
import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
from torch.distributions import Categorical
import json

# Add PhaseB to path for MovementNetwork
sys.path.insert(0, "/home/vishalj/Flowmasters/simulation/PhaseB")
from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

RESULTS_DIR = "results"
os.makedirs(RESULTS_DIR, exist_ok=True)

JSON_PATH = "/home/vishalj/Flowmasters/simulation/PhaseB/sambalpur_signals_15_movement.json"
MODEL_PATH = "/home/vishalj/Flowmasters/simulation/PhaseB/checkpoints_movement/policy_shared_final.pt"


class PolicyNet(nn.Module):
    def __init__(self, obs_dim, hidden=128, n_actions=5):
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


class SimpleFixedController:
    def __init__(self, network, cycle_time=60, min_green=6):
        self.net = network
        self.phase_durations = {}
        self.phase_clock = {}
        self.phase_index = {}
        for s in self.net.signals:
            sid = s.signal_id
            n_phases = max(1, s.n_phases)
            duration = max(min_green, cycle_time // n_phases)
            self.phase_durations[sid] = [duration] * n_phases
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0

    def act(self, obs_dict):
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                self.phase_clock[sid] += 1
                cur_idx = self.phase_index[sid]
                if self.phase_clock[sid] >= self.phase_durations[sid][cur_idx]:
                    self.phase_index[sid] = (cur_idx + 1) % len(self.phase_durations[sid])
                    self.phase_clock[sid] = 0
                out[e][sid] = int(self.phase_index[sid])
        return out

    def reset(self):
        for sid in self.net.signal_ids:
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0


class TrafficOptController:
    BASE_GREEN = 15
    MAX_GREEN = 45

    def __init__(self, network, min_green=6):
        self.net = network
        self.min_green = min_green
        self.step_count = {s.signal_id: 0 for s in self.net.signals}
        self.current_phase = {s.signal_id: 0 for s in self.net.signals}

    def act(self, obs_dict):
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                sig = self.net.signals[self.net.id_to_index[sid]]
                obs_vec = obs_dict[e].get(sid, [0]*6)
                total_q = sum(obs_vec[0:3])
                saturation = min(1.5, total_q / 100.0)
                green_time = int(self.BASE_GREEN + saturation * 30)
                green_time = max(self.min_green, min(self.MAX_GREEN, green_time))
                
                n_phases = max(1, sig.n_phases)
                self.step_count[sid] += 1
                phase_step = self.step_count[sid] % (green_time * n_phases)
                self.current_phase[sid] = (phase_step // green_time) % n_phases
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


def evaluate_method(name, method, env, mvnet, steps=1000, device="cpu", is_policy=False, policy=None):
    if not is_policy:
        method.reset()
    obs = env.reset()
    qs = []
    
    for t in range(steps):
        if is_policy:
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
        else:
            actions = method.act(obs)
        
        next_obs, _, _, _ = env.step(actions)
        obs = next_obs
        arr, _ = flatten_obs(next_obs)
        qs.append(float(arr[:, 0:3].sum() / arr.shape[0]))
    
    qs = np.array(qs)
    return {
        "method": name,
        "mean_queue": float(qs.mean()),
        "max_queue": float(qs.max()),
        "steady_queue": float(qs[-200:].mean()) if len(qs) >= 200 else float(qs.mean()),
        "queue_ts": qs
    }


def main():
    print("="*60)
    print("QUICK COMPARISON: PhaseB MAPPO vs Baselines")
    print("="*60 + "\n")
    
    mvnet = MovementNetwork(JSON_PATH)
    print(f"✓ Network: {len(mvnet.signal_ids)} signals")
    
    env = VectorizedTrafficEnv(
        JSON_PATH, n_envs=2, min_green=8, max_green=60, yellow_time=3,
        base_demand_level=0.20, dynamic_demand=True, demand_variation_mode="cyclic",
        random_traffic_shocks=True, shock_probability=0.03, bursty_release=True,
        spillback_penalty=20.0, normalize_obs=True
    )
    
    obs = env.reset()
    obs_dim = len(obs[0][list(obs[0].keys())[0]])
    
    # Load MAPPO
    print(f"✓ Loading MAPPO from: {MODEL_PATH}")
    state_dict = torch.load(MODEL_PATH, map_location="cpu")
    hidden = int(state_dict['net.0.weight'].shape[0]) if 'net.0.weight' in state_dict else 128
    n_actions = int(state_dict['logits.weight'].shape[0]) if 'logits.weight' in state_dict else 5
    policy = PolicyNet(obs_dim, hidden=hidden, n_actions=n_actions)
    policy.load_state_dict(state_dict)
    policy.eval()
    print(f"✓ MAPPO loaded (hidden={hidden}, actions={n_actions})")
    
    # Create baselines
    simple = SimpleFixedController(mvnet)
    traffic_opt = TrafficOptController(mvnet)
    
    # Evaluate
    steps = 1000  # Fast eval
    print(f"\nEvaluating ({steps} steps each)...")
    
    print("  Simple Fixed...", end=" ", flush=True)
    simple_result = evaluate_method("Simple_Fixed", simple, env, mvnet, steps)
    print(f"mean_q={simple_result['mean_queue']:.3f}")
    
    print("  Traffic Opt...", end=" ", flush=True)
    traffic_result = evaluate_method("Traffic_Opt", traffic_opt, env, mvnet, steps)
    print(f"mean_q={traffic_result['mean_queue']:.3f}")
    
    print("  MAPPO...", end=" ", flush=True)
    mappo_result = evaluate_method("MAPPO", None, env, mvnet, steps, "cpu", True, policy)
    print(f"mean_q={mappo_result['mean_queue']:.3f}")
    
    # Results
    results = [simple_result, traffic_result, mappo_result]
    
    print("\n" + "="*60)
    print("RESULTS")
    print("="*60)
    print(f"{'Method':<20} {'Mean Queue':>12} {'Max Queue':>12}")
    print("-"*44)
    for r in results:
        print(f"{r['method']:<20} {r['mean_queue']:>12.3f} {r['max_queue']:>12.3f}")
    
    # Improvement
    simple_q = simple_result['mean_queue']
    traffic_q = traffic_result['mean_queue']
    mappo_q = mappo_result['mean_queue']
    
    print("\n📊 IMPROVEMENT")
    print(f"  MAPPO vs Simple Fixed: {(simple_q - mappo_q)/simple_q*100:+.1f}%")
    print(f"  MAPPO vs Traffic Opt:  {(traffic_q - mappo_q)/traffic_q*100:+.1f}%")
    
    # Plot
    plt.figure(figsize=(12, 5))
    
    plt.subplot(1, 2, 1)
    methods = ["Simple Fixed", "Traffic Opt", "MAPPO"]
    mean_qs = [r['mean_queue'] for r in results]
    colors = ['#e74c3c', '#f39c12', '#27ae60']
    bars = plt.bar(methods, mean_qs, color=colors, edgecolor='black')
    plt.ylabel("Mean Queue")
    plt.title("Mean Queue Comparison")
    for bar, val in zip(bars, mean_qs):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height(), f'{val:.3f}', ha='center', va='bottom', fontweight='bold')
    
    plt.subplot(1, 2, 2)
    for r, c in zip(results, colors):
        plt.plot(r['queue_ts'], color=c, label=r['method'], alpha=0.8)
    plt.xlabel("Step")
    plt.ylabel("Queue")
    plt.title("Queue Over Time")
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(f"{RESULTS_DIR}/quick_comparison.png", dpi=150)
    print(f"\n✓ Saved: {RESULTS_DIR}/quick_comparison.png")
    
    # Save CSV
    df = pd.DataFrame([{k: v for k, v in r.items() if k != 'queue_ts'} for r in results])
    df.to_csv(f"{RESULTS_DIR}/quick_comparison.csv", index=False)
    print(f"✓ Saved: {RESULTS_DIR}/quick_comparison.csv")


if __name__ == "__main__":
    main()
