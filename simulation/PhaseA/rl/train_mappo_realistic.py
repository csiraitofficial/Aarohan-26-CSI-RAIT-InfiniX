#!/usr/bin/env python3
 
import os
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical

from traffic_env import VectorizedTrafficEnv

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CKPT_DIR = "checkpoints_realistic"
os.makedirs(CKPT_DIR, exist_ok=True)

# -----------------------------
# Networks
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


class ValueNet(nn.Module):
    def __init__(self, obs_dim, hidden=128):
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


def ppo_update(policy, valuefn, optimizer,
               obs_arr, actions_arr, old_logprobs_arr,
               returns_arr, advantages_arr,
               clip_eps=0.2, entropy_coef=0.01,
               epochs=5, batch_size=4096):

    n = len(obs_arr)
    idxs = np.arange(n)

    for _ in range(epochs):
        np.random.shuffle(idxs)
        for start in range(0, n, batch_size):
            end = start + batch_size
            b = idxs[start:end]
            if len(b) == 0:
                continue

            obs_t = torch.tensor(obs_arr[b], dtype=torch.float32, device=DEVICE)
            acts_t = torch.tensor(actions_arr[b], dtype=torch.long, device=DEVICE)
            old_log_t = torch.tensor(old_logprobs_arr[b], dtype=torch.float32, device=DEVICE)
            ret_t = torch.tensor(returns_arr[b], dtype=torch.float32, device=DEVICE)
            adv_t = torch.tensor(advantages_arr[b], dtype=torch.float32, device=DEVICE)

            logits = policy(obs_t)
            dist = Categorical(logits=logits)
            new_log = dist.log_prob(acts_t)
            entropy = dist.entropy().mean()

            values = valuefn(obs_t)

            ratio = torch.exp(new_log - old_log_t)
            surr1 = ratio * adv_t
            surr2 = torch.clamp(ratio, 1.0 - clip_eps, 1.0 + clip_eps) * adv_t
            loss_actor = -torch.min(surr1, surr2).mean()
            loss_critic = ((ret_t - values) ** 2).mean()
            loss = loss_actor + 0.5 * loss_critic - entropy_coef * entropy

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(list(policy.parameters()) + list(valuefn.parameters()), 0.5)
            optimizer.step()


# -----------------------------
# Training Config
# -----------------------------

JSON_PATH = "sambalpur_signals_15.json"

N_ENVS = 8
ROLLOUT_STEPS = 512
N_ITERS = 2000          # increase if you have time
GAMMA = 0.99
LAMBDA = 0.95
LR = 3e-4
CLIP_EPS = 0.2
BATCH_SIZE = 4096
PPO_EPOCHS = 5
ENTROPY_COEF = 0.01

ENV_KWARGS = dict(
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


# -----------------------------
# Main
# -----------------------------

def main():
    # temp env just to get obs_dim
    temp_env = VectorizedTrafficEnv(JSON_PATH, n_envs=1, **ENV_KWARGS)
    temp_obs = temp_env.reset()
    sample_signal = list(temp_obs[0].keys())[0]
    obs_dim = len(temp_obs[0][sample_signal])

    policy = PolicyNet(obs_dim).to(DEVICE)
    valuefn = ValueNet(obs_dim).to(DEVICE)
    optimizer = optim.Adam(list(policy.parameters()) + list(valuefn.parameters()), lr=LR)

    env = VectorizedTrafficEnv(JSON_PATH, n_envs=N_ENVS, **ENV_KWARGS)

    for it in range(N_ITERS):
        obs_buf = []
        act_buf = []
        logp_buf = []
        val_buf = []
        rew_buf = []
        done_buf = []

        obs = env.reset()

        for step in range(ROLLOUT_STEPS):
            obs_arr, keys = flatten_obs(obs)
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=DEVICE)

            with torch.no_grad():
                logits = policy(obs_t)
                dist = Categorical(logits=logits)
                actions_t = dist.sample()
                logprobs_t = dist.log_prob(actions_t)
                values_t = valuefn(obs_t)

            actions = actions_t.cpu().numpy()
            logprobs = logprobs_t.cpu().numpy()
            values = values_t.cpu().numpy()

            # build action dict
            actions_dict = {}
            idx = 0
            for e, sid in keys:
                actions_dict.setdefault(e, {})
                actions_dict[e][sid] = int(actions[idx])
                idx += 1

            next_obs, reward_dict, done_dict, info = env.step(actions_dict)

            # flatten rewards and dones
            rewards = []
            dones = []
            for e, sid in keys:
                rewards.append(reward_dict[e][sid])
                dones.append(done_dict[e][sid])

            obs_buf.append(obs_arr)
            act_buf.append(actions)
            logp_buf.append(logprobs)
            val_buf.append(values)
            rew_buf.append(np.array(rewards, dtype=np.float32))
            done_buf.append(np.array(dones, dtype=np.float32))

            obs = next_obs

        # stack
        obs_buf = np.vstack(obs_buf)           # [T*N, obs_dim]
        act_buf = np.hstack(act_buf)           # [T*N]
        logp_buf = np.hstack(logp_buf)         # [T*N]
        val_buf = np.vstack(val_buf)           # [T, N]
        rew_buf = np.vstack(rew_buf)           # [T, N]
        done_buf = np.vstack(done_buf)         # [T, N]

        T, N = rew_buf.shape
        vals = val_buf.reshape(T, N)
        returns = np.zeros_like(vals)
        advs = np.zeros_like(vals)

        last_gae = np.zeros(N)
        last_value = np.zeros(N)

        # GAE
        for t in reversed(range(T)):
            mask = 1.0 - done_buf[t]
            delta = rew_buf[t] + GAMMA * last_value * mask - vals[t]
            last_gae = delta + GAMMA * LAMBDA * mask * last_gae
            advs[t] = last_gae
            returns[t] = vals[t] + advs[t]
            last_value = vals[t]

        returns = returns.reshape(-1)
        advantages = advs.reshape(-1)
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # PPO update
        ppo_update(policy, valuefn, optimizer,
                   obs_buf, act_buf, logp_buf,
                   returns, advantages,
                   clip_eps=CLIP_EPS,
                   entropy_coef=ENTROPY_COEF,
                   epochs=PPO_EPOCHS,
                   batch_size=BATCH_SIZE)

        mean_rew = float(rew_buf.mean())
        if it % 10 == 0:
            print(f"Iter {it}/{N_ITERS} | mean_step_reward={mean_rew:.3f}")

        if it % 200 == 0 and it > 0:
            torch.save(policy.state_dict(), os.path.join(CKPT_DIR, f"policy_iter{it}.pt"))
            torch.save(valuefn.state_dict(), os.path.join(CKPT_DIR, f"value_iter{it}.pt"))

    # final save
    torch.save(policy.state_dict(), os.path.join(CKPT_DIR, "policy_final.pt"))
    torch.save(valuefn.state_dict(), os.path.join(CKPT_DIR, "value_final.pt"))
    print("Training finished, saved final checkpoints.")


if __name__ == "__main__":
    main()