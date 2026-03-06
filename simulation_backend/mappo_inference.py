#!/usr/bin/env python3
"""
MAPPO Inference Module
Loads trained MAPPO policy and generates actions from observations.
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Tuple
from pathlib import Path

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class PolicyNet(nn.Module):
    """Policy network matching training architecture"""
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


def flatten_obs(obs_dict: Dict[int, Dict[str, np.ndarray]]) -> Tuple[np.ndarray, List[Tuple[int, str]]]:
    """
    Flatten observations to numpy array.
    Returns: (obs_array, keys_list) where keys_list is [(env_idx, signal_id), ...]
    """
    all_obs = []
    keys = []
    for e in sorted(obs_dict.keys()):
        for sid in sorted(obs_dict[e].keys()):
            keys.append((e, sid))
            all_obs.append(obs_dict[e][sid])
    return np.array(all_obs, dtype=np.float32), keys


def load_mappo_policy(checkpoint_path: str, obs_dim: int, n_actions: int = 4, hidden: int = None) -> PolicyNet:
    """
    Load trained MAPPO policy from checkpoint.
    Automatically detects hidden size from checkpoint if not provided.
    
    Args:
        checkpoint_path: Path to policy_shared_final.pt
        obs_dim: Observation dimension (6 for movement-level env)
        n_actions: Maximum number of actions (phases)
        hidden: Hidden layer size (if None, will be detected from checkpoint)
    
    Returns:
        Loaded PolicyNet in eval mode
    """
    # Load checkpoint first to detect hidden size
    checkpoint = torch.load(checkpoint_path, map_location=DEVICE, weights_only=False)
    
    # Detect hidden size from checkpoint weights
    if hidden is None:
        # Check the first layer weight shape: [hidden, obs_dim]
        if "net.0.weight" in checkpoint:
            hidden = checkpoint["net.0.weight"].shape[0]
        elif "logits.weight" in checkpoint:
            # Infer from logits layer: [n_actions, hidden]
            hidden = checkpoint["logits.weight"].shape[1]
        else:
            # Fallback to default
            hidden = 128
        print(f"[MAPPO] Detected hidden size: {hidden} from checkpoint")
    
    policy = PolicyNet(obs_dim, hidden=hidden, n_actions=n_actions).to(DEVICE)
    
    # Load checkpoint
    policy.load_state_dict(checkpoint)
    policy.eval()
    
    return policy


def build_actions_dict(
    mvnet,
    policy: PolicyNet,
    obs: Dict[int, Dict[str, np.ndarray]],
    keys: List[Tuple[int, str]]
) -> Dict[int, Dict[str, int]]:
    """
    Generate actions from observations using MAPPO policy.
    
    Args:
        mvnet: MovementNetwork instance
        policy: Loaded PolicyNet
        obs: Observation dict {env_idx: {signal_id: obs_vec}}
        keys: List of (env_idx, signal_id) tuples matching flattened obs
    
    Returns:
        Actions dict {env_idx: {signal_id: phase_index}}
    """
    # Flatten observations
    obs_arr, _ = flatten_obs(obs)
    
    # Convert to tensor
    obs_t = torch.from_numpy(obs_arr).to(dtype=torch.float32, device=DEVICE, non_blocking=True)
    
    # Get actions from policy (deterministic argmax for consistent behavior)
    with torch.inference_mode():
        logits = policy(obs_t)
        actions_t = torch.argmax(logits, dim=-1)
        actions = actions_t.cpu().numpy()
    
    # Build actions dict, mapping policy action to signal phase
    actions_dict = {}
    for idx, (e, sid) in enumerate(keys):
        actions_dict.setdefault(e, {})
        # Get number of phases for this signal
        sig = mvnet.signals[mvnet.id_to_index[sid]]
        n_phases = max(1, sig.n_phases)
        # Map policy action to valid phase index
        phase_idx = int(actions[idx]) % n_phases
        actions_dict[e][sid] = phase_idx
    
    return actions_dict


def build_step_message(
    sim_id: str,
    t: int,
    sim_step: float,
    obs: Dict[int, Dict[str, np.ndarray]],
    info: Dict[int, Dict[str, any]],
    mvnet,
    last_phases: Dict[str, int] = None
) -> Tuple[Dict[str, any], Dict[str, int]]:
    """
    Build JSON-compatible message for frontend from simulation state.
    
    Returns:
        (message_dict, new_phases_dict)
    """
    env_idx = 0
    obs_env = obs.get(env_idx, {})
    spill_map = info.get(env_idx, {}).get("spillback", {})
    
    signals_payload = []
    events = []
    new_phases = {}
    
    total_queue = 0.0
    spill_count = 0
    signal_count = 0
    
    for sid in sorted(obs_env.keys()):
        vec = obs_env[sid]
        if vec.shape[0] < 6:
            continue
        
        # Extract NORMALIZED queue values from observation vector (0-1 range approx)
        through_q_norm = float(vec[0])
        left_q_norm = float(vec[1])
        right_q_norm = float(vec[2])
        phase_idx = int(vec[3])
        t_phase_norm = float(vec[4])
        
        # DENORMALIZE for frontend visualization
        # Environment uses obs_queue_scale=50.0 for normalization
        # Formula: raw_queue = normalized_queue * scale_factor
        QUEUE_SCALE = 50.0  # Must match environment's obs_queue_scale parameter
        
        # Use ACTUAL queue values from MAPPO environment (no fake minimums)
        # This ensures frontend displays true simulation state
        through_q = through_q_norm * QUEUE_SCALE
        left_q = left_q_norm * QUEUE_SCALE
        right_q = right_q_norm * QUEUE_SCALE
        
        total_q_sig = through_q + left_q + right_q
        sb = bool(spill_map.get(sid, False))
        
        total_queue += total_q_sig
        signal_count += 1
        if sb:
            spill_count += 1
        
        sig_obj = mvnet.signals[mvnet.id_to_index[sid]]
        n_phases = sig_obj.n_phases if sig_obj.n_phases > 0 else 1
        
        # Get allowed movements for current phase
        allowed_movements = []
        if phase_idx < len(sig_obj.phases):
            phase = sig_obj.phases[phase_idx]
            allowed_movements = phase.get("allowed_movements", [])
        
        signals_payload.append({
            "signal_id": sid,
            "lat": getattr(sig_obj, 'lat', None),
            "lon": getattr(sig_obj, 'lon', None),
            "junction_type": getattr(sig_obj, 'junction_type', '4way'),
            "approaches": getattr(sig_obj, 'approaches', []),
            "phase_index": phase_idx,
            "n_phases": n_phases,
            "allowed_movements": allowed_movements,
            "time_in_phase_norm": t_phase_norm,
            "queues": {
                "through": through_q,
                "left": left_q,
                "right": right_q,
                "total": total_q_sig,
            },
            "spillback": sb,
        })
        
        new_phases[sid] = phase_idx
        if last_phases is not None:
            prev = last_phases.get(sid)
            if prev is not None and prev != phase_idx:
                events.append({
                    "type": "phase_change",
                    "signal_id": sid,
                    "from_phase": int(prev),
                    "to_phase": int(phase_idx),
                })
    
    avg_queue = float(total_queue / max(1, signal_count))
    spill_frac = float(spill_count / max(1, signal_count))
    
    # Build network topology info
    network_info = []
    for sig in mvnet.signals:
        downstream = []
        for link in mvnet.downstream.get(sig.signal_id, []):
            downstream.append({
                "signal": link["signal"],
                "distance_m": link.get("distance_m", 0),
                "travel_time_s": link.get("travel_time_s", 0),
            })
        
        network_info.append({
            "signal_id": sig.signal_id,
            "lat": sig.lat,
            "lon": sig.lon,
            "junction_type": sig.junction_type,
            "downstream": downstream,
        })
    
    msg = {
        "sim_id": sim_id,
        "t": int(t),
        "dt": float(sim_step),
        "signals": signals_payload,
        "network": network_info,
        "metrics": {
            "avg_queue": avg_queue,
            "total_queue": float(total_queue),
            "spillback_fraction": spill_frac,
        },
        "events": events,
    }
    
    return msg, new_phases
