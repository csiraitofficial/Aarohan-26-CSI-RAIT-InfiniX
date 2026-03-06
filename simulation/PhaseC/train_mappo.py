import os
import argparse
import time

import numpy as np
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CKPT_DIR = "checkpoints"
RESULTS_DIR = "results"
os.makedirs(CKPT_DIR, exist_ok=True)
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


class ValueNet(nn.Module):
    def __init__(self, obs_dim, hidden=256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, 1)
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)


def flatten_obs(obs_dict):
    all_obs, keys = [], []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def train(args):
    print("=" * 60)
    print("MAPPO TRAINING")
    print("=" * 60)
    print(f"Device: {DEVICE}")
    print(f"Iterations: {args.n_iters}")
    print("=" * 60 + "\n")

    mvnet = MovementNetwork(args.json)
    print(f"✓ Loaded network with {len(mvnet.signal_ids)} signals")

    env = VectorizedTrafficEnv(
        args.json, n_envs=args.n_envs,
        min_green=args.min_green, max_green=args.max_green, yellow_time=args.yellow_time,
        base_demand_level=args.base_demand_level, dynamic_demand=args.dynamic_demand,
        demand_variation_mode=args.demand_variation_mode,
        random_traffic_shocks=args.random_traffic_shocks, shock_probability=args.shock_probability,
        bursty_release=args.bursty_release, spillback_penalty=args.spillback_penalty,
        normalize_obs=args.normalize_obs
    )

    obs = env.reset()
    sample_signal = list(obs[0].keys())[0]
    obs_dim = len(obs[0][sample_signal])
    max_phases = max([s.n_phases if s.n_phases > 0 else 1 for s in mvnet.signals])

    print(f"✓ Environment created (obs_dim={obs_dim}, max_phases={max_phases})")

    policy = PolicyNet(obs_dim, hidden=args.hidden, n_actions=max_phases).to(DEVICE)
    value_fn = ValueNet(obs_dim, hidden=args.hidden).to(DEVICE)
    optimizer = optim.Adam(list(policy.parameters()) + list(value_fn.parameters()), lr=args.lr)

    training_rewards = []
    training_queues = []
    start_time = time.time()

    for it in range(args.n_iters):
        obs_buf, act_buf, logp_buf, val_buf, rew_buf, done_buf = [], [], [], [], [], []
        obs = env.reset()

        for step in range(args.rollout_steps):
            obs_arr, keys = flatten_obs(obs)
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=DEVICE)

            with torch.no_grad():
                logits = policy(obs_t)
                dist = Categorical(logits=logits)
                actions = dist.sample()
                logps = dist.log_prob(actions)
                values = value_fn(obs_t)

            actions_np = actions.cpu().numpy()
            actions_dict = {}
            idx = 0
            for e, sid in keys:
                actions_dict.setdefault(e, {})
                nph = max(1, mvnet.signals[mvnet.id_to_index[sid]].n_phases)
                actions_dict[e][sid] = int(actions_np[idx]) % nph
                idx += 1

            next_obs, reward_dict, done_dict, info = env.step(actions_dict)

            rewards, dones = [], []
            for e, sid in keys:
                rewards.append(reward_dict[e][sid])
                dones.append(done_dict[e][sid])

            obs_buf.append(obs_arr)
            act_buf.append(actions_np)
            logp_buf.append(logps.cpu().numpy())
            val_buf.append(values.cpu().numpy())
            rew_buf.append(np.array(rewards, dtype=np.float32))
            done_buf.append(np.array(dones, dtype=np.float32))
            obs = next_obs

        # Stack buffers
        obs_buf = np.vstack(obs_buf)
        act_buf = np.hstack(act_buf)
        logp_buf = np.hstack(logp_buf)
        val_buf = np.vstack(val_buf)
        rew_buf = np.vstack(rew_buf)
        done_buf = np.vstack(done_buf)

        T, N = rew_buf.shape
        advs = np.zeros_like(rew_buf)
        returns = np.zeros_like(rew_buf)

        # Bootstrap
        obs_arr_final, _ = flatten_obs(obs)
        obs_t_final = torch.tensor(obs_arr_final, dtype=torch.float32, device=DEVICE)
        with torch.no_grad():
            last_value = value_fn(obs_t_final).cpu().numpy()

        # GAE
        last_gae = np.zeros(N)
        for t in reversed(range(T)):
            mask = 1.0 - done_buf[t]
            delta = rew_buf[t] + args.gamma * last_value * mask - val_buf[t]
            last_gae = delta + args.gamma * args.lam * mask * last_gae
            advs[t] = last_gae
            returns[t] = val_buf[t] + advs[t]
            last_value = val_buf[t]

        advs_flat = advs.reshape(-1)
        advs_flat = (advs_flat - advs_flat.mean()) / (advs_flat.std() + 1e-8)
        returns_flat = returns.reshape(-1)

        # PPO update
        n = len(advs_flat)
        idxs = np.arange(n)
        ent_coef = args.entropy_coef * (1.0 - it / args.n_iters) + 0.01 * (it / args.n_iters) if args.entropy_anneal else args.entropy_coef

        for _ in range(args.ppo_epochs):
            np.random.shuffle(idxs)
            for start in range(0, n, args.batch_size):
                b = idxs[start:start + args.batch_size]
                if len(b) == 0:
                    continue

                obs_t = torch.tensor(obs_buf[b], dtype=torch.float32, device=DEVICE)
                acts_t = torch.tensor(act_buf[b], dtype=torch.long, device=DEVICE)
                old_log_t = torch.tensor(logp_buf[b], dtype=torch.float32, device=DEVICE)
                ret_t = torch.tensor(returns_flat[b], dtype=torch.float32, device=DEVICE)
                adv_t = torch.tensor(advs_flat[b], dtype=torch.float32, device=DEVICE)

                logits = policy(obs_t)
                dist = Categorical(logits=logits)
                new_log = dist.log_prob(acts_t)
                entropy = dist.entropy().mean()
                values = value_fn(obs_t)

                ratio = torch.exp(new_log - old_log_t)
                surr1 = ratio * adv_t
                surr2 = torch.clamp(ratio, 1.0 - args.clip_eps, 1.0 + args.clip_eps) * adv_t
                loss_actor = -torch.min(surr1, surr2).mean()
                loss_critic = ((ret_t - values) ** 2).mean()
                loss = loss_actor + args.vf_coef * loss_critic - ent_coef * entropy

                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(list(policy.parameters()) + list(value_fn.parameters()), 0.5)
                optimizer.step()

        mean_reward = float(rew_buf.mean())
        training_rewards.append(mean_reward)
        arr, _ = flatten_obs(obs)
        mean_queue = float(arr[:, 0:3].sum() / arr.shape[0])
        training_queues.append(mean_queue)

        if it % args.log_interval == 0:
            elapsed = (time.time() - start_time) / 60
            print(f"[Iter {it}/{args.n_iters}] reward={mean_reward:.1f} queue={mean_queue:.3f} time={elapsed:.1f}m")

        if (it + 1) % args.save_interval == 0:
            torch.save(policy.state_dict(), f"{CKPT_DIR}/policy_iter{it+1}.pt")
            torch.save(value_fn.state_dict(), f"{CKPT_DIR}/value_iter{it+1}.pt")
            print(f"  ✓ Saved checkpoint iter {it+1}")

    # Final save
    torch.save(policy.state_dict(), f"{CKPT_DIR}/policy_final.pt")
    torch.save(value_fn.state_dict(), f"{CKPT_DIR}/value_final.pt")

    # Save training curves
    plt.figure(figsize=(12, 4))
    plt.subplot(1, 2, 1)
    plt.plot(training_rewards)
    plt.xlabel("Iteration")
    plt.ylabel("Mean Reward")
    plt.title("MAPPO Training Reward")
    plt.grid(True, alpha=0.3)

    plt.subplot(1, 2, 2)
    plt.plot(training_queues)
    plt.xlabel("Iteration")
    plt.ylabel("Mean Queue")
    plt.title("MAPPO Training Queue")
    plt.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(f"{RESULTS_DIR}/mappo_training_curves.png", dpi=150)
    plt.close()

    print("\n" + "=" * 60)
    print("MAPPO TRAINING COMPLETE")
    print(f"Model saved to: {CKPT_DIR}/policy_final.pt")
    print(f"Curves saved to: {RESULTS_DIR}/mappo_training_curves.png")
    print("=" * 60)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--json", type=str, default="sambalpur_signals_15_movement.json")
    p.add_argument("--n_envs", type=int, default=8)
    p.add_argument("--n_iters", type=int, default=2000)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--lam", type=float, default=0.95)
    p.add_argument("--clip_eps", type=float, default=0.2)
    p.add_argument("--entropy_coef", type=float, default=0.03)
    p.add_argument("--entropy_anneal", action="store_true")
    p.add_argument("--ppo_epochs", type=int, default=4)
    p.add_argument("--batch_size", type=int, default=4096)
    p.add_argument("--hidden", type=int, default=256)
    p.add_argument("--min_green", type=int, default=8)
    p.add_argument("--max_green", type=int, default=60)
    p.add_argument("--yellow_time", type=int, default=3)
    p.add_argument("--base_demand_level", type=float, default=0.20)
    p.add_argument("--dynamic_demand", action="store_true")
    p.add_argument("--demand_variation_mode", type=str, default="cyclic")
    p.add_argument("--random_traffic_shocks", action="store_true")
    p.add_argument("--shock_probability", type=float, default=0.03)
    p.add_argument("--bursty_release", action="store_true")
    p.add_argument("--spillback_penalty", type=float, default=20.0)
    p.add_argument("--normalize_obs", action="store_true")
    p.add_argument("--rollout_steps", type=int, default=1024)
    p.add_argument("--log_interval", type=int, default=50)
    p.add_argument("--save_interval", type=int, default=500)
    p.add_argument("--vf_coef", type=float, default=1.0)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(args)
