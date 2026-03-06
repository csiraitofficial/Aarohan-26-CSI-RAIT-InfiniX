#!/usr/bin/env python3

import os
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical
from traffic_env import VectorizedTrafficEnv

# ── Device & checkpoint directory ──────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CKPT_DIR = "checkpoints_realistic"
os.makedirs(CKPT_DIR, exist_ok=True)


class PolicyNet(nn.Module):
    """
    Takes a signal's observation → outputs probability scores
    for the two actions: [keep_phase, switch_phase].
    Architecture: obs → 128 → 128 → 2 (logits)
    """
    def __init__(self, obs_dim, hidden=128, n_actions=2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden),  nn.ReLU(),
        )
        self.head = nn.Linear(hidden, n_actions)

    def forward(self, x):
        return self.head(self.net(x))


class ValueNet(nn.Module):
    
    def __init__(self, obs_dim, hidden=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden),  nn.ReLU(),
            nn.Linear(hidden, 1),
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)


# ═══════════════════════════════════════════════════════════
#  STEP 2 — Helper: flatten dict observations into an array
# ═══════════════════════════════════════════════════════════

def flatten_obs(obs_dict):
    """
    The environment returns observations as nested dicts:
        obs_dict[env_index][signal_id] → observation_vector

    This flattens them into:
        obs_array  [num_agents, obs_dim]   — for feeding into the network
        keys       [(env_idx, signal_id)]  — to map results back
    """
    obs_list, keys = [], []
    for env_idx in obs_dict:
        for signal_id in obs_dict[env_idx]:
            keys.append((env_idx, signal_id))
            obs_list.append(obs_dict[env_idx][signal_id])
    return np.array(obs_list, dtype=np.float32), keys


# ═══════════════════════════════════════════════════════════
#  STEP 3 — PPO update (the core learning step)
# ═══════════════════════════════════════════════════════════

def ppo_update(policy, valuefn, optimizer,
               obs, actions, old_logprobs, returns, advantages,
               clip_eps=0.2, entropy_coef=0.01,
               epochs=5, batch_size=4096):
    """
    Runs several epochs of mini-batch gradient descent on the
    collected experience to improve the policy and value networks.

    Key idea of PPO: limit how much the policy can change in one
    update by "clipping" the probability ratio.
    """
    n = len(obs)
    indices = np.arange(n)

    for _ in range(epochs):
        np.random.shuffle(indices)

        for start in range(0, n, batch_size):
            batch = indices[start : start + batch_size]
            if len(batch) == 0:
                continue

            # Move batch data to GPU/CPU
            obs_t   = torch.tensor(obs[batch],           dtype=torch.float32, device=DEVICE)
            acts_t  = torch.tensor(actions[batch],       dtype=torch.long,    device=DEVICE)
            oldlp_t = torch.tensor(old_logprobs[batch],  dtype=torch.float32, device=DEVICE)
            ret_t   = torch.tensor(returns[batch],       dtype=torch.float32, device=DEVICE)
            adv_t   = torch.tensor(advantages[batch],    dtype=torch.float32, device=DEVICE)

            # ── Policy loss (actor) ──
            logits  = policy(obs_t)
            dist    = Categorical(logits=logits)
            new_lp  = dist.log_prob(acts_t)
            entropy = dist.entropy().mean()

            ratio = torch.exp(new_lp - oldlp_t)                        # how much policy changed
            clipped_ratio = torch.clamp(ratio, 1 - clip_eps, 1 + clip_eps)
            policy_loss = -torch.min(ratio * adv_t, clipped_ratio * adv_t).mean()

            # ── Value loss (critic) ──
            values = valuefn(obs_t)
            value_loss = ((ret_t - values) ** 2).mean()

            # ── Total loss ──
            #   = policy_loss + 0.5 * value_loss − entropy_bonus
            #   (entropy bonus encourages exploration)
            loss = policy_loss + 0.5 * value_loss - entropy_coef * entropy

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                list(policy.parameters()) + list(valuefn.parameters()), 0.5
            )
            optimizer.step()


# ═══════════════════════════════════════════════════════════
#  STEP 4 — Training configuration
# ═══════════════════════════════════════════════════════════

# Path to the Sambalpur 15-junction network definition
JSON_PATH = "sambalpur_signals_15.json"

# Training hyper-parameters
N_ENVS         = 8       # run 8 copies of the city in parallel (more data per iteration)
ROLLOUT_STEPS  = 512     # each iteration collects 512 simulation steps
N_ITERS        = 2000    # total training iterations
GAMMA          = 0.99    # discount factor  (how much future reward matters)
LAMBDA         = 0.95    # GAE lambda        (bias-variance trade-off)
LR             = 3e-4    # learning rate for Adam optimizer
CLIP_EPS       = 0.2     # PPO clipping range
BATCH_SIZE     = 4096    # mini-batch size for gradient descent
PPO_EPOCHS     = 5       # re-use each rollout this many times
ENTROPY_COEF   = 0.01    # exploration bonus weight

# Traffic environment settings (realistic Indian-traffic dynamics)
ENV_KWARGS = dict(
    min_green=20,                   # minimum green phase duration (seconds)
    max_green=60,                   # maximum green phase duration
    yellow_time=3,                  # yellow light duration
    base_demand_level=0.20,         # baseline traffic arrival rate
    dynamic_demand=True,            # demand changes over the day
    demand_variation_mode="cyclic", # cyclic morning/evening rush pattern
    random_traffic_shocks=True,     # sudden demand spikes (accidents, events)
    shock_probability=0.03,         # chance of a shock per step
    bursty_release=True,            # green-phase platoon release
    spillback_penalty=20.0,         # heavy penalty if queue overflows
    switch_penalty=0.2,             # small cost for unnecessary phase switches
    normalize_obs=True,             # normalize observations to [0, 1]
)


# ═══════════════════════════════════════════════════════════
#  STEP 5 — Main training loop
# ═══════════════════════════════════════════════════════════

def main():
    # ── 5a. Figure out the observation size ──
    temp_env = VectorizedTrafficEnv(JSON_PATH, n_envs=1, **ENV_KWARGS)
    temp_obs = temp_env.reset()
    first_signal = list(temp_obs[0].keys())[0]
    obs_dim = len(temp_obs[0][first_signal])

    # ── 5b. Create networks and optimizer ──
    policy    = PolicyNet(obs_dim).to(DEVICE)
    valuefn   = ValueNet(obs_dim).to(DEVICE)
    optimizer = optim.Adam(
        list(policy.parameters()) + list(valuefn.parameters()), lr=LR
    )

    # ── 5c. Create the training environment (8 parallel cities) ──
    env = VectorizedTrafficEnv(JSON_PATH, n_envs=N_ENVS, **ENV_KWARGS)

    # ── 5d. Training loop ──
    for iteration in range(N_ITERS):

        # ──────────── PHASE A: Collect experience ────────────
        # Run the current policy for 512 steps and record everything.
        obs_buf, act_buf, logp_buf = [], [], []
        val_buf, rew_buf, done_buf = [], [], []

        obs = env.reset()

        for step in range(ROLLOUT_STEPS):
            # Flatten dict observations → array for the neural network
            obs_array, agent_keys = flatten_obs(obs)
            obs_tensor = torch.tensor(obs_array, dtype=torch.float32, device=DEVICE)

            # Ask the policy what to do (no gradient needed here)
            with torch.no_grad():
                logits    = policy(obs_tensor)
                dist      = Categorical(logits=logits)
                actions_t = dist.sample()                   # sample actions
                logprobs  = dist.log_prob(actions_t)        # log P(action)
                values    = valuefn(obs_tensor)              # state value V(s)

            actions  = actions_t.cpu().numpy()
            logprobs = logprobs.cpu().numpy()
            values   = values.cpu().numpy()

            # Convert flat actions back into dict format for the environment
            action_dict = {}
            for i, (env_idx, signal_id) in enumerate(agent_keys):
                action_dict.setdefault(env_idx, {})
                action_dict[env_idx][signal_id] = int(actions[i])

            # Step the environment
            next_obs, reward_dict, done_dict, info = env.step(action_dict)

            # Flatten rewards and dones in the same agent order
            rewards = np.array([reward_dict[e][s] for e, s in agent_keys], dtype=np.float32)
            dones   = np.array([done_dict[e][s]   for e, s in agent_keys], dtype=np.float32)

            # Store this step's data
            obs_buf.append(obs_array)
            act_buf.append(actions)
            logp_buf.append(logprobs)
            val_buf.append(values)
            rew_buf.append(rewards)
            done_buf.append(dones)

            obs = next_obs

        # ──────────── PHASE B: Compute advantages (GAE) ────────────
        # Stack collected data: shape [T, N_agents] for rewards/values/dones
        obs_buf  = np.vstack(obs_buf)     # [T*N, obs_dim]
        act_buf  = np.hstack(act_buf)     # [T*N]
        logp_buf = np.hstack(logp_buf)    # [T*N]
        val_buf  = np.vstack(val_buf)     # [T, N]
        rew_buf  = np.vstack(rew_buf)     # [T, N]
        done_buf = np.vstack(done_buf)    # [T, N]

        T, N = rew_buf.shape
        returns    = np.zeros((T, N))
        advantages = np.zeros((T, N))

        # Walk backwards through time to compute GAE
        last_gae   = np.zeros(N)
        last_value = np.zeros(N)

        for t in reversed(range(T)):
            not_done = 1.0 - done_buf[t]                          # 0 if episode ended
            td_error = rew_buf[t] + GAMMA * last_value * not_done - val_buf[t]
            last_gae = td_error + GAMMA * LAMBDA * not_done * last_gae
            advantages[t] = last_gae
            returns[t]    = val_buf[t] + advantages[t]
            last_value    = val_buf[t]

        # Flatten and normalize advantages
        returns    = returns.reshape(-1)
        advantages = advantages.reshape(-1)
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # ──────────── PHASE C: Update networks with PPO ────────────
        ppo_update(
            policy, valuefn, optimizer,
            obs_buf, act_buf, logp_buf,
            returns, advantages,
            clip_eps=CLIP_EPS,
            entropy_coef=ENTROPY_COEF,
            epochs=PPO_EPOCHS,
            batch_size=BATCH_SIZE,
        )

        # ──────────── Logging & checkpointing ────────────
        avg_reward = float(rew_buf.mean())
        if iteration % 10 == 0:
            print(f"Iter {iteration}/{N_ITERS}  |  avg_step_reward = {avg_reward:.3f}")

        if iteration > 0 and iteration % 200 == 0:
            torch.save(policy.state_dict(),  os.path.join(CKPT_DIR, f"policy_iter{iteration}.pt"))
            torch.save(valuefn.state_dict(), os.path.join(CKPT_DIR, f"value_iter{iteration}.pt"))

    # ── Final save ──
    torch.save(policy.state_dict(),  os.path.join(CKPT_DIR, "policy_final.pt"))
    torch.save(valuefn.state_dict(), os.path.join(CKPT_DIR, "value_final.pt"))
    print("Training complete — final checkpoints saved.")


if __name__ == "__main__":
    main()