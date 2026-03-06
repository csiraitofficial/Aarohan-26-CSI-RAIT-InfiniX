#!/bin/bash
# run_fast.sh - FAST 3-way comparison (~20 min total)

set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "============================================================"
echo "FAST MODE: Complete in ~20 minutes"
echo "============================================================"

# Ultra-fast MAPPO training (500 iterations, minimal envs)
echo ""
echo "[1/5] Training MAPPO (fast mode)..."
python train_mappo.py \
    --n_iters 500 \
    --n_envs 2 \
    --rollout_steps 256 \
    --hidden 64 \
    --batch_size 1024 \
    --ppo_epochs 2 \
    --dynamic_demand \
    --normalize_obs \
    --save_interval 250 \
    --log_interval 50

# Fast evaluations (1000 steps, 2 episodes)
echo ""
echo "[2/5] Evaluating Simple Fixed..."
python eval_simple_fixed.py --n_envs 2 --episodes 2 --steps 1000

echo ""
echo "[3/5] Evaluating Traffic Optimization..."
python eval_traffic_optimization.py --n_envs 2 --episodes 2 --steps 1000

echo ""
echo "[4/5] Evaluating MAPPO..."
python eval_mappo.py --model checkpoints/policy_final.pt --n_envs 2 --episodes 2 --steps 1000 --device cpu

echo ""
echo "[5/5] Generating comparison..."
python compare_all.py

echo ""
echo "============================================================"
echo "DONE! Check results/ for comparison_plot.png"
echo "============================================================"
