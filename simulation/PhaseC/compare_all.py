#!/usr/bin/env python3
"""
compare_all.py - Three-Way Comparison: MAPPO vs Traffic Optimization vs Simple Fixed

Loads results from individual evaluation scripts and generates comparison visualization.

Usage:
    1. First run each evaluation separately:
       python eval_simple_fixed.py --episodes 5 --steps 3600
       python eval_traffic_optimization.py --episodes 5 --steps 3600
       python eval_mappo.py --model checkpoints/policy_final.pt --episodes 5 --steps 3600

    2. Then run comparison:
       python compare_all.py
"""

import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import json

RESULTS_DIR = "results"


def load_results():
    """Load results from individual evaluation outputs."""
    results = {}

    # Load Simple Fixed
    if os.path.exists(f"{RESULTS_DIR}/simple_fixed_summary.csv"):
        df = pd.read_csv(f"{RESULTS_DIR}/simple_fixed_summary.csv")
        results["Simple_Fixed"] = df.iloc[0].to_dict()
        if os.path.exists(f"{RESULTS_DIR}/simple_fixed_queue_ts.npy"):
            results["Simple_Fixed"]["queue_ts"] = np.load(f"{RESULTS_DIR}/simple_fixed_queue_ts.npy")
    else:
        print("⚠ Simple Fixed results not found. Run: python eval_simple_fixed.py")

    # Load Traffic Optimization
    if os.path.exists(f"{RESULTS_DIR}/traffic_optimization_summary.csv"):
        df = pd.read_csv(f"{RESULTS_DIR}/traffic_optimization_summary.csv")
        results["Traffic_Opt"] = df.iloc[0].to_dict()
        if os.path.exists(f"{RESULTS_DIR}/traffic_optimization_queue_ts.npy"):
            results["Traffic_Opt"]["queue_ts"] = np.load(f"{RESULTS_DIR}/traffic_optimization_queue_ts.npy")
    else:
        print("⚠ Traffic Optimization results not found. Run: python eval_traffic_optimization.py")

    # Load MAPPO
    if os.path.exists(f"{RESULTS_DIR}/mappo_summary.csv"):
        df = pd.read_csv(f"{RESULTS_DIR}/mappo_summary.csv")
        results["MAPPO"] = df.iloc[0].to_dict()
        if os.path.exists(f"{RESULTS_DIR}/mappo_queue_ts.npy"):
            results["MAPPO"]["queue_ts"] = np.load(f"{RESULTS_DIR}/mappo_queue_ts.npy")
    else:
        print("⚠ MAPPO results not found. Run: python eval_mappo.py")

    return results


def generate_comparison(results):
    """Generate comparison plots and summary."""
    if len(results) < 3:
        print("\n❌ Need results from all 3 methods to generate comparison.")
        print("Run all evaluation scripts first, then run compare_all.py")
        return

    methods = ["Simple_Fixed", "Traffic_Opt", "MAPPO"]
    colors = ['#e74c3c', '#f39c12', '#27ae60']
    labels = ["Simple Fixed", "Traffic Opt", "MAPPO"]

    print("\n" + "=" * 70)
    print("THREE-WAY COMPARISON: MAPPO vs Traffic Optimization vs Simple Fixed")
    print("=" * 70 + "\n")

    # Create comparison figure
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))

    # Bar chart: Mean Queue
    ax1 = axes[0]
    mean_qs = [results[m]["mean_queue"] for m in methods]
    bars = ax1.bar(labels, mean_qs, color=colors, edgecolor='black', linewidth=1.2)
    ax1.set_ylabel("Mean Queue (veh-eq)", fontsize=11)
    ax1.set_title("Mean Queue Comparison", fontsize=12, fontweight='bold')
    ax1.grid(axis='y', alpha=0.3)
    for bar, val in zip(bars, mean_qs):
        ax1.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                 f'{val:.3f}', ha='center', va='bottom', fontsize=10, fontweight='bold')

    # Bar chart: Spillback Rate
    ax2 = axes[1]
    spill_rates = [results[m]["spillback_rate"] * 100 for m in methods]
    bars = ax2.bar(labels, spill_rates, color=colors, edgecolor='black', linewidth=1.2)
    ax2.set_ylabel("Spillback Rate (%)", fontsize=11)
    ax2.set_title("Spillback Rate Comparison", fontsize=12, fontweight='bold')
    ax2.grid(axis='y', alpha=0.3)
    for bar, val in zip(bars, spill_rates):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.1,
                 f'{val:.2f}%', ha='center', va='bottom', fontsize=10, fontweight='bold')

    # Line chart: Queue over time
    ax3 = axes[2]
    for method, color, label in zip(methods, colors, labels):
        if "queue_ts" in results[method]:
            ax3.plot(results[method]["queue_ts"], color=color, label=label, linewidth=1.5, alpha=0.8)
    ax3.set_xlabel("Step (seconds)", fontsize=11)
    ax3.set_ylabel("Average Queue", fontsize=11)
    ax3.set_title("Queue Over Time", fontsize=12, fontweight='bold')
    ax3.legend()
    ax3.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(f"{RESULTS_DIR}/comparison_plot.png", dpi=150)
    plt.close()

    # Print results table
    print("┌─────────────────────┬──────────────┬──────────────┬──────────────┐")
    print("│       Metric        │ Simple Fixed │ Traffic Opt  │    MAPPO     │")
    print("├─────────────────────┼──────────────┼──────────────┼──────────────┤")
    print(f"│ Mean Queue          │   {results['Simple_Fixed']['mean_queue']:8.3f}   │   {results['Traffic_Opt']['mean_queue']:8.3f}   │   {results['MAPPO']['mean_queue']:8.3f}   │")
    print(f"│ Max Queue           │   {results['Simple_Fixed']['max_queue']:8.3f}   │   {results['Traffic_Opt']['max_queue']:8.3f}   │   {results['MAPPO']['max_queue']:8.3f}   │")
    print(f"│ Steady Queue        │   {results['Simple_Fixed']['steady_queue']:8.3f}   │   {results['Traffic_Opt']['steady_queue']:8.3f}   │   {results['MAPPO']['steady_queue']:8.3f}   │")
    print(f"│ Spillback Rate (%)  │   {results['Simple_Fixed']['spillback_rate']*100:8.2f}   │   {results['Traffic_Opt']['spillback_rate']*100:8.2f}   │   {results['MAPPO']['spillback_rate']*100:8.2f}   │")
    print("└─────────────────────┴──────────────┴──────────────┴──────────────┘")

    # Improvement analysis
    simple_q = results["Simple_Fixed"]["mean_queue"]
    traffic_q = results["Traffic_Opt"]["mean_queue"]
    mappo_q = results["MAPPO"]["mean_queue"]

    print("\n📊 IMPROVEMENT ANALYSIS (Mean Queue Reduction)")
    print("-" * 50)
    print(f"Traffic Opt vs Simple Fixed: {(simple_q - traffic_q) / simple_q * 100:+.1f}%")
    print(f"MAPPO vs Simple Fixed:       {(simple_q - mappo_q) / simple_q * 100:+.1f}%")
    print(f"MAPPO vs Traffic Opt:        {(traffic_q - mappo_q) / traffic_q * 100:+.1f}%")

    # Determine winner
    winner = "MAPPO" if mappo_q <= min(simple_q, traffic_q) else ("Traffic_Opt" if traffic_q <= simple_q else "Simple_Fixed")
    print(f"\n🏆 BEST PERFORMER: {winner}")

    # Save summary CSV
    summary = []
    for method in methods:
        summary.append({
            "method": method,
            "mean_queue": results[method]["mean_queue"],
            "max_queue": results[method]["max_queue"],
            "steady_queue": results[method]["steady_queue"],
            "spillback_rate": results[method]["spillback_rate"],
        })
    df = pd.DataFrame(summary)
    df.to_csv(f"{RESULTS_DIR}/comparison_summary.csv", index=False)

    # Save JSON report
    report = {
        "summary": summary,
        "improvement": {
            "traffic_opt_vs_simple": float((simple_q - traffic_q) / simple_q * 100),
            "mappo_vs_simple": float((simple_q - mappo_q) / simple_q * 100),
            "mappo_vs_traffic_opt": float((traffic_q - mappo_q) / traffic_q * 100),
        },
        "winner": winner
    }
    with open(f"{RESULTS_DIR}/comparison_report.json", "w") as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 70)
    print("OUTPUT FILES")
    print("=" * 70)
    print(f"✓ {RESULTS_DIR}/comparison_plot.png")
    print(f"✓ {RESULTS_DIR}/comparison_summary.csv")
    print(f"✓ {RESULTS_DIR}/comparison_report.json")


if __name__ == "__main__":
    results = load_results()
    generate_comparison(results)
