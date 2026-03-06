#!/usr/bin/env python3
"""
train_mappo_movement.py - patched MAPPO-like trainer (movement-level)

Fixes applied:
 - Removed erroneous reward normalization before GAE.
 - Compute bootstrap (last_value) from critic in raw reward scale (no reward renormalization).
 - Added .detach() before .cpu().numpy() conversions to avoid "requires_grad" errors.
 - Corrected gradient clipping to include all policy + value params.
 - Kept per-group advantage normalization (stable & intended).
 - Minor CLI/hyperparam cleanup (no duplicate args).
 - Reduced learning-rate default already present in your last edit (1e-4).
"""

import os
import argparse
import math
from copy import deepcopy
import time

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical

from traffic_env_movement import VectorizedTrafficEnv, MovementNetwork

# -------------------------
# Device / checkpoint dir
# -------------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CKPT_DIR = "checkpoints_movement"
os.makedirs(CKPT_DIR, exist_ok=True)

# -------------------------
# Networks
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


# -------------------------
# Helpers
# -------------------------
def flatten_obs(obs_dict):
    """
    obs_dict[env_idx][sid] -> obs_vec
    -> returns (ndarray [N_agents, obs_dim], keys list[(env_idx, sid)])
    """
    all_obs = []
    keys = []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def ppo_update_multi(policy_objs, value_objs, optimizer,
                     obs_arr, actions_arr, old_logprobs_arr,
                     returns_arr, advantages_arr,
                     clip_eps=0.2, entropy_coef=0.01, epochs=4, batch_size=4096, vf_coef=1.0):
    """
    Single-update routine for the shared-policy case.
    If there is >1 policy object, the trainer will call group-local updates separately.
    """
    n = len(obs_arr)
    idxs = np.arange(n)
    for _ in range(epochs):
        np.random.shuffle(idxs)
        for start in range(0, n, batch_size):
            b = idxs[start:start + batch_size]
            if len(b) == 0:
                continue
            obs_t = torch.tensor(obs_arr[b], dtype=torch.float32, device=DEVICE)
            acts_t = torch.tensor(actions_arr[b], dtype=torch.long, device=DEVICE)
            old_log_t = torch.tensor(old_logprobs_arr[b], dtype=torch.float32, device=DEVICE)
            ret_t = torch.tensor(returns_arr[b], dtype=torch.float32, device=DEVICE)
            adv_t = torch.tensor(advantages_arr[b], dtype=torch.float32, device=DEVICE)

            # Only supports single shared policy in this function
            policy = list(policy_objs.values())[0]
            valuefn = list(value_objs.values())[0]

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
            loss = loss_actor + vf_coef * loss_critic - entropy_coef * entropy

            optimizer.zero_grad()
            loss.backward()

            # Clip all params belonging to policy_objs + value_objs
            all_params = []
            for p in policy_objs.values():
                all_params += list(p.parameters())
            for v in value_objs.values():
                all_params += list(v.parameters())
            torch.nn.utils.clip_grad_norm_(all_params, 0.5)

            optimizer.step()


# -------------------------
# Fixed baseline (unchanged logic)
# -------------------------
class FixedMovementBaseline:
    """
    Simple pre-timed baseline derived from movement JSON.
    Computes per-phase durations proportional to movement weights and cycles.
    """

    def __init__(self, network: MovementNetwork, cycle_time: int = 60, min_green: int = 6):
        self.net = network
        self.cycle_time = cycle_time
        self.min_green = min_green

        self.phase_durations = {}
        self.phase_clock = {}
        self.phase_index = {}
        for s in self.net.signals:
            sid = s.signal_id
            if s.n_phases > 0:
                preset_ok = True
                for p in s.phases:
                    if p.get("preset_duration", None) is None:
                        preset_ok = False
                        break
                if preset_ok:
                    durations = [max(self.min_green, int(p.get("preset_duration"))) for p in s.phases]
                else:
                    weights = []
                    for p in s.phases:
                        w = 0.0
                        for mid in p.get("allowed_movements", []):
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
                        weights.append(max(0.01, w))
                    total = sum(weights) if weights else 1.0
                    durations = [max(self.min_green, int(round(self.cycle_time * (w / total)))) for w in weights]
                    diff = self.cycle_time - sum(durations)
                    if diff != 0 and len(durations) > 0:
                        durations[0] = max(self.min_green, durations[0] + diff)
            else:
                durations = [self.cycle_time]

            self.phase_durations[sid] = durations
            self.phase_clock[sid] = 0
            self.phase_index[sid] = 0

    def act(self, obs_dict):
        out = {}
        for e in obs_dict:
            out[e] = {}
            for sid in self.net.signal_ids:
                self.phase_clock[sid] += 1
                cur_idx = int(self.phase_index[sid])
                dur = self.phase_durations[sid][cur_idx]
                if self.phase_clock[sid] >= dur:
                    self.phase_index[sid] = (cur_idx + 1) % len(self.phase_durations[sid])
                    self.phase_clock[sid] = 0
                out[e][sid] = int(self.phase_index[sid])
        return out


# -------------------------
# Training Routine
# -------------------------
def train(args):
    # Prepare movement network and discover junction types
    mvnet = MovementNetwork(args.json)
    # Group signals by junction type (we'll focus on '4way' and 'T'/'Y' grouping)
    group_map = {}  # sid -> group_name ('4way' or 'ty' or 'other')
    groups = {"4way": [], "ty": [], "other": []}
    for s in mvnet.signals:
        sid = s.signal_id
        jt = (s.junction_type or "").lower()
        if "4" in jt or "4way" in jt or "four" in jt:
            group_map[sid] = "4way"
            groups["4way"].append(sid)
        elif "t" in jt or "y" in jt:
            group_map[sid] = "ty"
            groups["ty"].append(sid)
        else:
            group_map[sid] = "other"
            groups["other"].append(sid)

    # Build a temp env to get obs_dim and action counts
    temp_env = VectorizedTrafficEnv(args.json, n_envs=1,
                                    min_green=args.min_green,
                                    max_green=args.max_green,
                                    yellow_time=args.yellow_time,
                                    base_demand_level=args.base_demand_level,
                                    dynamic_demand=args.dynamic_demand,
                                    demand_variation_mode=args.demand_variation_mode,
                                    random_traffic_shocks=args.random_traffic_shocks,
                                    shock_probability=args.shock_probability,
                                    bursty_release=args.bursty_release,
                                    spillback_penalty=args.spillback_penalty,
                                    normalize_obs=args.normalize_obs)
    temp_obs = temp_env.reset()
    sample_signal = list(temp_obs[0].keys())[0]
    obs_dim = len(temp_obs[0][sample_signal])

    # Determine max phases across signals (for action space)
    max_phases = max([s.n_phases if s.n_phases > 0 else 1 for s in mvnet.signals])
    print(f"[TRAIN] obs_dim={obs_dim}, max_phases={max_phases}")

    # Build policies
    use_split = args.split_policies and (len(groups["ty"]) > 0 and len(groups["4way"]) > 0)
    policy_objs = {}
    value_objs = {}

    if use_split:
        # one policy for 4way, one for ty (other->4way)
        n_actions_4 = max([mvnet.signals[mvnet.id_to_index[sid]].n_phases for sid in groups["4way"]]) if groups["4way"] else 1
        n_actions_ty = max([mvnet.signals[mvnet.id_to_index[sid]].n_phases for sid in groups["ty"]]) if groups["ty"] else 1
        policy_objs["4way"] = PolicyNet(obs_dim, hidden=args.hidden, n_actions=max(1, n_actions_4)).to(DEVICE)
        value_objs["4way"] = ValueNet(obs_dim, hidden=args.hidden).to(DEVICE)
        policy_objs["ty"] = PolicyNet(obs_dim, hidden=args.hidden, n_actions=max(1, n_actions_ty)).to(DEVICE)
        value_objs["ty"] = ValueNet(obs_dim, hidden=args.hidden).to(DEVICE)
        # if 'other' exists, map it to 4way policy
        print(f"[TRAIN] Split policies enabled: 4way actions={n_actions_4}, ty actions={n_actions_ty}")
    else:
        # Single shared policy
        policy_objs["shared"] = PolicyNet(obs_dim, hidden=args.hidden, n_actions=max(1, max_phases)).to(DEVICE)
        value_objs["shared"] = ValueNet(obs_dim, hidden=args.hidden).to(DEVICE)
        print("[TRAIN] Single shared policy")

    # Create optimizer for all parameters
    all_params = []
    for p in policy_objs.values():
        all_params += list(p.parameters())
    for v in value_objs.values():
        all_params += list(v.parameters())
    optimizer = optim.Adam(all_params, lr=args.lr)

    # Build training env
    env = VectorizedTrafficEnv(args.json, n_envs=args.n_envs,
                               min_green=args.min_green,
                               max_green=args.max_green,
                               yellow_time=args.yellow_time,
                               base_demand_level=args.base_demand_level,
                               dynamic_demand=args.dynamic_demand,
                               demand_variation_mode=args.demand_variation_mode,
                               random_traffic_shocks=args.random_traffic_shocks,
                               shock_probability=args.shock_probability,
                               bursty_release=args.bursty_release,
                               spillback_penalty=args.spillback_penalty,
                               normalize_obs=args.normalize_obs)

    baseline = FixedMovementBaseline(mvnet, cycle_time=args.cycle_time, min_green=args.min_green)

    # entropy annealing helper
    def current_entropy_coef(iter_idx):
        if args.entropy_anneal:
            # linear anneal from args.entropy_coef down to 0.01
            frac = min(1.0, float(iter_idx) / max(1.0, args.n_iters))
            return args.entropy_coef * (1.0 - frac) + 0.01 * frac
        return args.entropy_coef

    # training loop
    start_time = time.time()
    for it in range(args.n_iters):
        obs_buf = []
        act_buf = []
        logp_buf = []
        val_buf = []
        rew_buf = []
        done_buf = []
        group_idx_buf = []  # group id per sample for per-group processing

        obs = env.reset()

        for step in range(args.rollout_steps):
            obs_arr, keys = flatten_obs(obs)  # [N_agents, obs_dim]
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=DEVICE)

            # Decide actions per-agent using appropriate policy
            if use_split:
                # Build masks: find indices per group
                idxs_4 = [i for i, (_, sid) in enumerate(keys) if group_map.get(sid, "other") == "4way" or group_map.get(sid) == "other"]
                idxs_ty = [i for i, (_, sid) in enumerate(keys) if group_map.get(sid) == "ty"]
                actions = np.zeros(len(keys), dtype=np.int64)
                logps = np.zeros(len(keys), dtype=np.float32)
                values = np.zeros(len(keys), dtype=np.float32)

                if len(idxs_4) > 0:
                    obs_4 = torch.tensor(obs_arr[idxs_4], dtype=torch.float32, device=DEVICE)
                    logits_4 = policy_objs["4way"](obs_4)
                    dist_4 = Categorical(logits=logits_4)
                    acts_4 = dist_4.sample()
                    logp_4 = dist_4.log_prob(acts_4)
                    vals_4 = value_objs["4way"](obs_4)
                    actions[idxs_4] = acts_4.detach().cpu().numpy()
                    logps[idxs_4] = logp_4.detach().cpu().numpy()
                    values[idxs_4] = vals_4.detach().cpu().numpy()

                if len(idxs_ty) > 0:
                    obs_ty = torch.tensor(obs_arr[idxs_ty], dtype=torch.float32, device=DEVICE)
                    logits_ty = policy_objs["ty"](obs_ty)
                    dist_ty = Categorical(logits=logits_ty)
                    acts_ty = dist_ty.sample()
                    logp_ty = dist_ty.log_prob(acts_ty)
                    vals_ty = value_objs["ty"](obs_ty)
                    actions[idxs_ty] = acts_ty.detach().cpu().numpy()
                    logps[idxs_ty] = logp_ty.detach().cpu().numpy()
                    values[idxs_ty] = vals_ty.detach().cpu().numpy()
            else:
                logits = list(policy_objs.values())[0](obs_t)
                dist = Categorical(logits=logits)
                actions_t = dist.sample()
                logps_t = dist.log_prob(actions_t)
                values_t = list(value_objs.values())[0](obs_t)
                actions = actions_t.detach().cpu().numpy()
                logps = logps_t.detach().cpu().numpy()
                values = values_t.detach().cpu().numpy()

            # Build actions dict for env.step: convert policy action -> signal phase (respect per-signal n_phases)
            actions_dict = {}
            idx = 0
            for e, sid in keys:
                actions_dict.setdefault(e, {})
                nph = max(1, mvnet.signals[mvnet.id_to_index[sid]].n_phases)
                if use_split:
                    grp = group_map.get(sid, "other")
                    if grp == "ty":
                        act = int(actions[idx]) % max(1, policy_objs["ty"].logits.out_features)
                    else:
                        act = int(actions[idx]) % max(1, policy_objs["4way"].logits.out_features)
                else:
                    act = int(actions[idx]) % max(1, list(policy_objs.values())[0].logits.out_features)
                # Map policy action to allowed phase index modulo nph
                actions_dict[e][sid] = int(act % nph)
                idx += 1

            next_obs, reward_dict, done_dict, info = env.step(actions_dict)

            # Collect flattened rewards/dones in same order as keys
            rewards = []
            dones = []
            for e, sid in keys:
                rewards.append(reward_dict[e][sid])
                dones.append(done_dict[e][sid])

            # Append to buffers
            obs_buf.append(obs_arr)
            act_buf.append(actions)
            logp_buf.append(logps)
            val_buf.append(values)
            rew_buf.append(np.array(rewards, dtype=np.float32))
            done_buf.append(np.array(dones, dtype=np.float32))

            # record group ids sequence (for per-group processing)
            for _, sid in keys:
                group_idx_buf.append(group_map.get(sid, "other"))

            obs = next_obs

        # Stack buffers
        obs_buf = np.vstack(obs_buf)            # [T*Nagents, obs_dim]
        act_buf = np.hstack(act_buf)            # [T*Nagents]
        logp_buf = np.hstack(logp_buf)          # [T*Nagents]
        val_buf = np.vstack(val_buf)            # [T, Nagents]
        rew_buf = np.vstack(rew_buf)            # [T, Nagents]
        done_buf = np.vstack(done_buf)          # [T, Nagents]

        T, Nagents = rew_buf.shape
        vals = val_buf.reshape(T, Nagents)
        returns = np.zeros_like(vals)
        advs = np.zeros_like(vals)

        # -----------------------
        # Compute bootstrap values (raw scale) from final obs
        # -----------------------
        obs_arr_final, keys_final = flatten_obs(obs)  # obs is the final state after rollout
        obs_t_final = torch.tensor(obs_arr_final, dtype=torch.float32, device=DEVICE)
        with torch.no_grad():
            if use_split:
                bootstrap_vals = np.zeros(len(keys_final), dtype=np.float32)
                idxs_4 = [i for i, (_, sid) in enumerate(keys_final) if group_map.get(sid, "other") == "4way" or group_map.get(sid) == "other"]
                idxs_ty = [i for i, (_, sid) in enumerate(keys_final) if group_map.get(sid) == "ty"]
                if len(idxs_4) > 0:
                    obs_4 = obs_t_final[idxs_4]
                    bootstrap_vals[idxs_4] = value_objs["4way"](obs_4).cpu().numpy()
                if len(idxs_ty) > 0:
                    obs_ty = obs_t_final[idxs_ty]
                    bootstrap_vals[idxs_ty] = value_objs["ty"](obs_ty).cpu().numpy()
                last_value = bootstrap_vals  # shape: [Nagents_final]
            else:
                last_value = list(value_objs.values())[0](obs_t_final).cpu().numpy()  # shape: [Nagents_final]

        # GAE backward compute (vectorized along agent-dimension)
        last_gae = np.zeros(Nagents)
        for t in reversed(range(T)):
            mask = 1.0 - done_buf[t]
            delta = rew_buf[t] + args.gamma * last_value * mask - vals[t]
            last_gae = delta + args.gamma * args.lam * mask * last_gae
            advs[t] = last_gae
            returns[t] = vals[t] + advs[t]
            last_value = vals[t]  # next iteration bootstrap is current-step value

        # Flatten for PPO update. We'll normalize advantages per-group.
        returns_flat = returns.reshape(-1)
        advs_flat = advs.reshape(-1)

        # Build per-sample group array aligned with flattened arrays
        group_seq = np.array(group_idx_buf)  # length = T * Nagents (should match advs_flat)
        if group_seq.shape[0] != advs_flat.shape[0]:
            # Safety: reconstruct from a freshly-reset env ordering
            tmp_obs, tmp_keys = flatten_obs(env.reset())
            single_step_groups = [group_map.get(sid, "other") for _, sid in tmp_keys]
            group_seq = np.tile(single_step_groups, T)
            group_seq = np.array(group_seq)

        # Normalize advantages per group
        advs_norm = advs_flat.copy()
        unique_groups = np.unique(group_seq)
        for g in unique_groups:
            mask = (group_seq == g)
            if np.sum(mask) > 0:
                vals_g = advs_flat[mask]
                mean_g = vals_g.mean()
                std_g = vals_g.std() + 1e-8
                advs_norm[mask] = (vals_g - mean_g) / std_g

        # If using split policies, call group-local PPO updates
        if use_split:
            # Build indices for groups
            for g in unique_groups:
                mask = (group_seq == g)
                if np.sum(mask) == 0:
                    continue
                obs_g = obs_buf.reshape(-1, obs_buf.shape[-1])[mask]
                acts_g = act_buf[mask]
                oldlog_g = logp_buf[mask]
                returns_g = returns_flat[mask]
                advs_g = advs_norm[mask]
                # choose policy/value for this group
                if g == "ty":
                    pol = policy_objs["ty"]
                    valf = value_objs["ty"]
                else:
                    # map '4way' and 'other' to 4way policy
                    pol = policy_objs["4way"]
                    valf = value_objs["4way"]
                # local PPO update (vectorized call)
                n = obs_g.shape[0]
                if n == 0:
                    continue
                idxs_local = np.arange(n)
                for _ in range(args.ppo_epochs):
                    np.random.shuffle(idxs_local)
                    for start in range(0, n, args.batch_size):
                        b = idxs_local[start:start + args.batch_size]
                        if len(b) == 0:
                            continue
                        obs_t = torch.tensor(obs_g[b], dtype=torch.float32, device=DEVICE)
                        acts_t = torch.tensor(acts_g[b], dtype=torch.long, device=DEVICE)
                        old_log_t = torch.tensor(oldlog_g[b], dtype=torch.float32, device=DEVICE)
                        ret_t = torch.tensor(returns_g[b], dtype=torch.float32, device=DEVICE)
                        adv_t = torch.tensor(advs_g[b], dtype=torch.float32, device=DEVICE)

                        logits = pol(obs_t)
                        dist = Categorical(logits=logits)
                        new_log = dist.log_prob(acts_t)
                        entropy = dist.entropy().mean()
                        values = valf(obs_t)

                        ratio = torch.exp(new_log - old_log_t)
                        surr1 = ratio * adv_t
                        surr2 = torch.clamp(ratio, 1.0 - args.clip_eps, 1.0 + args.clip_eps) * adv_t
                        loss_actor = -torch.min(surr1, surr2).mean()
                        loss_critic = ((ret_t - values) ** 2).mean()
                        ent_coef = current_entropy_coef(it)
                        loss = loss_actor + args.vf_coef * loss_critic - ent_coef * entropy

                        optimizer.zero_grad()
                        loss.backward()
                        torch.nn.utils.clip_grad_norm_(list(pol.parameters()) + list(valf.parameters()), 0.5)
                        optimizer.step()
        else:
            # Single shared policy update (use whole dataset)
            ppo_update_multi(policy_objs, value_objs, optimizer,
                             obs_buf.reshape(-1, obs_buf.shape[-1]),
                             act_buf,
                             logp_buf,
                             returns_flat,
                             advs_norm,
                             clip_eps=args.clip_eps,
                             entropy_coef=current_entropy_coef(it),
                             epochs=args.ppo_epochs,
                             batch_size=args.batch_size,
                             vf_coef=args.vf_coef)

        # Logging
        if it % args.log_interval == 0:
            mean_step_reward = float(rew_buf.mean())
            elapsed = time.time() - start_time
            print(f"[Iter {it}/{args.n_iters}] mean_step_reward={mean_step_reward:.3f} elapsed={elapsed/60:.1f}m ent_coef={current_entropy_coef(it):.4f}")

        # periodic evaluation and checkpoint
        if (it + 1) % args.eval_interval == 0 or (it + 1) == args.n_iters:
            eval_metrics = evaluate_policy_single(policy_objs, mvnet, args.json, device=DEVICE,
                                                 n_envs=args.eval_n_envs, episodes=args.eval_episodes, steps=args.eval_steps,
                                                 group_map=group_map, use_split=use_split)
            baseline_metrics = evaluate_baseline(baseline, args.json, n_envs=args.eval_n_envs,
                                                 episodes=args.eval_episodes, steps=args.eval_steps)
            print(f"--- EVAL (iter {it+1}) policy_mean_queue={eval_metrics['mean_queue']:.3f} baseline_mean_queue={baseline_metrics['mean_queue']:.3f} ---")
            # save checkpoint
            for name, pol in policy_objs.items():
                torch.save(pol.state_dict(), os.path.join(CKPT_DIR, f"policy_{name}_iter{it+1}.pt"))
            for name, valf in value_objs.items():
                torch.save(valf.state_dict(), os.path.join(CKPT_DIR, f"value_{name}_iter{it+1}.pt"))

    # final save
    for name, pol in policy_objs.items():
        torch.save(pol.state_dict(), os.path.join(CKPT_DIR, f"policy_{name}_final.pt"))
    for name, valf in value_objs.items():
        torch.save(valf.state_dict(), os.path.join(CKPT_DIR, f"value_{name}_final.pt"))
    print("Training complete; final checkpoints saved.")


# -------------------------
# Evaluation helpers
# -------------------------
def flatten_obs_list(obs_dict):
    return flatten_obs(obs_dict)


def evaluate_policy_single(policy_objs, mvnet: MovementNetwork, json_path: str, device="cpu",
                           n_envs=4, episodes=3, steps=1800, group_map=None, use_split=False):
    """
    Evaluate current policies (policy_objs) on env. Returns same metrics as baseline.
    If use_split=True, expects policy_objs keys like '4way' and 'ty'.
    """
    env = VectorizedTrafficEnv(json_path, n_envs=n_envs,
                               min_green=8, max_green=60, yellow_time=3,
                               base_demand_level=0.20, dynamic_demand=True,
                               demand_variation_mode="cyclic", random_traffic_shocks=True,
                               shock_probability=0.03, bursty_release=True,
                               spillback_penalty=20.0, normalize_obs=True)

    for pol in policy_objs.values():
        pol.eval()

    queues_eps = []
    max_q_eps = []
    steady_q_eps = []
    spill_eps = []

    for ep in range(episodes):
        obs = env.reset()
        qs = []
        spills = []
        for t in range(steps):
            obs_arr, keys = flatten_obs(obs)
            obs_t = torch.tensor(obs_arr, dtype=torch.float32, device=device)

            # action selection respecting groups
            if use_split:
                actions = np.zeros(len(keys), dtype=np.int64)
                idxs_4 = [i for i, (_, sid) in enumerate(keys) if group_map.get(sid, "other") == "4way" or group_map.get(sid) == "other"]
                idxs_ty = [i for i, (_, sid) in enumerate(keys) if group_map.get(sid) == "ty"]
                if len(idxs_4) > 0:
                    obs_4 = torch.tensor(obs_arr[idxs_4], dtype=torch.float32, device=device)
                    logits_4 = policy_objs["4way"](obs_4)
                    dist_4 = Categorical(logits=logits_4)
                    acts_4 = dist_4.sample().cpu().numpy()
                    actions[idxs_4] = acts_4
                if len(idxs_ty) > 0:
                    obs_ty = torch.tensor(obs_arr[idxs_ty], dtype=torch.float32, device=device)
                    logits_ty = policy_objs["ty"](obs_ty)
                    dist_ty = Categorical(logits=logits_ty)
                    acts_ty = dist_ty.sample().cpu().numpy()
                    actions[idxs_ty] = acts_ty
            else:
                logits = list(policy_objs.values())[0](obs_t)
                dist = Categorical(logits=logits)
                actions = dist.sample().cpu().numpy()

            # map actions to env actions dict
            actions_dict = {}
            idx = 0
            for e, sid in keys:
                actions_dict.setdefault(e, {})
                nph = max(1, mvnet.signals[mvnet.id_to_index[sid]].n_phases)
                if use_split:
                    grp = group_map.get(sid, "other")
                    if grp == "ty":
                        act = int(actions[idx]) % max(1, policy_objs["ty"].logits.out_features)
                    else:
                        act = int(actions[idx]) % max(1, policy_objs["4way"].logits.out_features)
                else:
                    act = int(actions[idx]) % max(1, list(policy_objs.values())[0].logits.out_features)
                actions_dict[e][sid] = int(act % nph)
                idx += 1

            next_obs, reward_dict, done_dict, info = env.step(actions_dict)
            obs = next_obs

            arr, _ = flatten_obs(next_obs)
            q_vals = arr[:, 0:3] if arr.shape[1] >= 3 else arr[:, 0:4]
            avg_q = float(q_vals.sum() / float(q_vals.shape[0]))
            qs.append(avg_q)

            # spillback fraction
            sp_count = 0
            tot = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    tot += 1
                    if sp_map[sid]:
                        sp_count += 1
            spills.append(float(sp_count) / float(tot) if tot > 0 else 0.0)

        qs = np.array(qs)
        spills = np.array(spills)
        queues_eps.append(float(qs.mean()))
        max_q_eps.append(float(qs.max()))
        steady_q_eps.append(float(qs[-600:].mean()) if len(qs) >= 600 else float(qs.mean()))
        spill_eps.append(float(spills.mean()))

    metrics = {
        "mean_queue": float(np.mean(queues_eps)),
        "max_queue": float(np.mean(max_q_eps)),
        "steady_queue": float(np.mean(steady_q_eps)),
        "spillback_rate": float(np.mean(spill_eps)),
        "episodes": episodes,
        "steps_per_episode": steps
    }
    return metrics


def evaluate_baseline(baseline: FixedMovementBaseline, json_path: str,
                      n_envs=4, episodes=3, steps=1800):
    # build env
    env = VectorizedTrafficEnv(json_path, n_envs=n_envs,
                               min_green=8, max_green=60, yellow_time=3,
                               base_demand_level=0.20, dynamic_demand=True,
                               demand_variation_mode="cyclic", random_traffic_shocks=True,
                               shock_probability=0.03, bursty_release=True,
                               spillback_penalty=20.0, normalize_obs=True)

    queues_eps = []
    max_q_eps = []
    steady_q_eps = []
    spill_eps = []

    for ep in range(episodes):
        obs = env.reset()
        qs = []
        spills = []
        for t in range(steps):
            actions = baseline.act(obs)
            next_obs, reward_dict, done_dict, info = env.step(actions)
            obs = next_obs

            arr, _ = flatten_obs(next_obs)
            q_vals = arr[:, 0:3] if arr.shape[1] >= 3 else arr[:, 0:4]
            avg_q = float(q_vals.sum() / float(q_vals.shape[0]))
            qs.append(avg_q)

            sp_count = 0
            tot = 0
            for e_idx in info:
                sp_map = info[e_idx].get("spillback", {})
                for sid in sp_map:
                    tot += 1
                    if sp_map[sid]:
                        sp_count += 1
            spills.append(float(sp_count) / float(tot) if tot > 0 else 0.0)

        qs = np.array(qs)
        spills = np.array(spills)
        queues_eps.append(float(qs.mean()))
        max_q_eps.append(float(qs.max()))
        steady_q_eps.append(float(qs[-600:].mean()) if len(qs) >= 600 else float(qs.mean()))
        spill_eps.append(float(spills.mean()))

    metrics = {
        "mean_queue": float(np.mean(queues_eps)),
        "max_queue": float(np.mean(max_q_eps)),
        "steady_queue": float(np.mean(steady_q_eps)),
        "spillback_rate": float(np.mean(spill_eps)),
        "episodes": episodes,
        "steps_per_episode": steps
    }
    return metrics


# -------------------------
# CLI
# -------------------------
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--json", type=str, default="sambalpur_signals_15_movement.json")
    p.add_argument("--n_envs", type=int, default=8)
    p.add_argument("--n_iters", type=int, default=6000)  # longer default
    p.add_argument("--lr", type=float, default=1e-4)  # Reduced from 3e-4 for stability
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--lam", type=float, default=0.95)
    p.add_argument("--clip_eps", type=float, default=0.2)
    p.add_argument("--entropy_coef", type=float, default=0.03)  # stronger default
    p.add_argument("--entropy_anneal", action="store_true", help="Linearly anneal entropy to a small value over training")
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
    p.add_argument("--rollout_steps", type=int, default=2048)  # Increased from 512
    p.add_argument("--log_interval", type=int, default=10)
    p.add_argument("--eval_interval", type=int, default=200)
    p.add_argument("--eval_n_envs", type=int, default=4)
    p.add_argument("--eval_episodes", type=int, default=3)
    p.add_argument("--eval_steps", type=int, default=1800)
    p.add_argument("--cycle_time", type=int, default=60)
    p.add_argument("--split_policies", action="store_true", help="Use separate policies for 4-way and T/Y junctions")
    p.add_argument("--vf_coef", type=float, default=1.0, help="Value function coefficient in loss")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(args)