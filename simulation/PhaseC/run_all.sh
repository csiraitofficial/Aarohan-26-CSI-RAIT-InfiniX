#!/bin/bash
# run_all.sh - Complete 3-way evaluation pipeline
#
# Usage: ./run_all.sh [n_iters]

set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

N_ITERS=${1:-2000}
STEPS=3600
EPISODES=5

echo "============================================================"
echo "PhaseC: Three-Way Comparison Pipeline"
echo "============================================================"
echo ""
echo "Steps:"
echo "  1. Train MAPPO ($N_ITERS iterations)"
echo "  2. Evaluate Simple Fixed Time"
echo "  3. Evaluate Traffic Optimization"
echo "  4. Evaluate MAPPO"
echo "  5. Generate comparison"
echo ""
echo "============================================================"

# Step 1: Train MAPPO
echo ""
echo "[Step 1/5] Training MAPPO..."
python train_mappo.py \
    --json sambalpur_signals_15_movement.json \
    --n_iters $N_ITERS \
    --n_envs 8 \
    --rollout_steps 1024 \
    --dynamic_demand \
    --normalize_obs \
    --bursty_release \
    --random_traffic_shocks \
    --entropy_anneal \
    --save_interval 500 \
    --log_interval 50

# Step 2: Evaluate Simple Fixed
echo ""
echo "[Step 2/5] Evaluating Simple Fixed Time..."
python eval_simple_fixed.py --episodes $EPISODES --steps $STEPS

# Step 3: Evaluate Traffic Optimization
echo ""
echo "[Step 3/5] Evaluating Traffic Optimization..."
python eval_traffic_optimization.py --episodes $EPISODES --steps $STEPS

# Step 4: Evaluate MAPPO
echo ""
echo "[Step 4/5] Evaluating MAPPO..."
python eval_mappo.py --model checkpoints/policy_final.pt --episodes $EPISODES --steps $STEPS

# Step 5: Generate comparison
echo ""
echo "[Step 5/5] Generating comparison..."
python compare_all.py

echo ""
echo "============================================================"
echo "COMPLETE! Results in results/ directory"
echo "============================================================"
