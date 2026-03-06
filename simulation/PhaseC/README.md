# PhaseC: Three-Way Traffic Signal Control Comparison

## Methods Compared

| Method | Type | Description |
|--------|------|-------------|
| **MAPPO** | RL-based | Multi-Agent PPO reinforcement learning |
| **Traffic Optimization** | Adaptive | SCOOT-style density-based control |
| **Simple Fixed** | Static | Equal phase division (cycle_time ÷ n_phases) |

## Files

| File | Description |
|------|-------------|
| `train_mappo.py` | MAPPO training script |
| `eval_simple_fixed.py` | Simple Fixed evaluation |
| `eval_traffic_optimization.py` | Traffic Optimization evaluation |
| `eval_mappo.py` | MAPPO evaluation |
| `compare_all.py` | 3-way comparison generator |
| `run_all.sh` | Complete pipeline script |

## Quick Start (tmux)

```bash
cd /home/vishalj/Flowmasters/simulation/PhaseC

# Run complete pipeline (train + evaluate + compare)
./run_all.sh 2000

# Or run steps individually:
python train_mappo.py --n_iters 2000 --dynamic_demand --normalize_obs --entropy_anneal
python eval_simple_fixed.py --episodes 5 --steps 3600
python eval_traffic_optimization.py --episodes 5 --steps 3600
python eval_mappo.py --model checkpoints/policy_final.pt --episodes 5 --steps 3600
python compare_all.py
```

## Outputs

- `checkpoints/` - MAPPO model weights
- `results/comparison_plot.png` - Visual comparison
- `results/comparison_summary.csv` - Metrics table
- `results/comparison_report.json` - Detailed report
