#!/usr/bin/env python3
"""
generate_visualizations.py - Create multiple comparison visualizations
From PhaseA evaluation data: Fixed Time vs MAPPO RL
"""

import numpy as np
import matplotlib.pyplot as plt
import os

# Create output directory
os.makedirs("visualizations", exist_ok=True)

# Data from PhaseA evaluations
data = {
    "Fixed Time": {
        "mean_queue": 0.5352495908737183,
        "max_queue": 0.8837456464767456,
        "steady_queue": 0.7145335701446533,
        "spillback_rate": 0.07319490740740742
    },
    "MAPPO RL": {
        "mean_queue": 0.49281768798828124,
        "max_queue": 0.8259577751159668,
        "steady_queue": 0.6545117497444153,
        "spillback_rate": 0.06006851851851851
    }
}

# Calculate improvements
improvements = {
    "mean_queue": (data["Fixed Time"]["mean_queue"] - data["MAPPO RL"]["mean_queue"]) / data["Fixed Time"]["mean_queue"] * 100,
    "max_queue": (data["Fixed Time"]["max_queue"] - data["MAPPO RL"]["max_queue"]) / data["Fixed Time"]["max_queue"] * 100,
    "steady_queue": (data["Fixed Time"]["steady_queue"] - data["MAPPO RL"]["steady_queue"]) / data["Fixed Time"]["steady_queue"] * 100,
    "spillback_rate": (data["Fixed Time"]["spillback_rate"] - data["MAPPO RL"]["spillback_rate"]) / data["Fixed Time"]["spillback_rate"] * 100,
}

print("="*60)
print("MAPPO RL vs Fixed Time - Improvement Analysis")
print("="*60)
for metric, imp in improvements.items():
    print(f"{metric}: {imp:+.1f}% improvement")
print("="*60)

# Set style
plt.style.use('seaborn-v0_8-darkgrid')
colors = {'Fixed Time': '#e74c3c', 'MAPPO RL': '#27ae60'}

# =============================================================================
# VISUALIZATION 1: Bar Chart Comparison (All Metrics)
# =============================================================================
fig, axes = plt.subplots(2, 2, figsize=(12, 10))
fig.suptitle('Fixed Time vs MAPPO RL: Traffic Signal Control Comparison', fontsize=16, fontweight='bold')

metrics = ['mean_queue', 'max_queue', 'steady_queue', 'spillback_rate']
titles = ['Mean Queue Length', 'Maximum Queue', 'Steady-State Queue', 'Spillback Rate']
units = ['vehicles', 'vehicles', 'vehicles', 'fraction']

for ax, metric, title, unit in zip(axes.flat, metrics, titles, units):
    values = [data["Fixed Time"][metric], data["MAPPO RL"][metric]]
    bars = ax.bar(['Fixed Time', 'MAPPO RL'], values, color=[colors['Fixed Time'], colors['MAPPO RL']], 
                  edgecolor='black', linewidth=1.5)
    ax.set_ylabel(f'{unit}', fontsize=11)
    ax.set_title(f'{title}\n(↓{improvements[metric]:.1f}% improvement)', fontsize=12, fontweight='bold')
    
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01, 
                f'{val:.3f}', ha='center', va='bottom', fontsize=11, fontweight='bold')

plt.tight_layout()
plt.savefig('visualizations/01_all_metrics_comparison.png', dpi=150, bbox_inches='tight')
plt.close()
print("✓ Saved: visualizations/01_all_metrics_comparison.png")

# =============================================================================
# VISUALIZATION 2: Improvement Percentage Chart
# =============================================================================
fig, ax = plt.subplots(figsize=(10, 6))

metric_names = ['Mean Queue\nReduction', 'Max Queue\nReduction', 'Steady Queue\nReduction', 'Spillback\nReduction']
imp_values = list(improvements.values())

bars = ax.barh(metric_names, imp_values, color='#27ae60', edgecolor='black', linewidth=1.5, height=0.6)
ax.set_xlabel('Improvement (%)', fontsize=12)
ax.set_title('MAPPO RL Improvement Over Fixed Time Baseline', fontsize=14, fontweight='bold')
ax.axvline(x=0, color='black', linewidth=0.5)

for bar, val in zip(bars, imp_values):
    ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2, 
            f'+{val:.1f}%', ha='left', va='center', fontsize=12, fontweight='bold', color='#27ae60')

ax.set_xlim(0, max(imp_values) + 5)
plt.tight_layout()
plt.savefig('visualizations/02_improvement_percentage.png', dpi=150, bbox_inches='tight')
plt.close()
print("✓ Saved: visualizations/02_improvement_percentage.png")

# =============================================================================
# VISUALIZATION 3: Radar Chart
# =============================================================================
fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))

categories = ['Mean Queue', 'Max Queue', 'Steady Queue', 'Spillback Rate']
N = len(categories)

# Normalize values (lower is better, so invert for radar)
fixed_vals = [data["Fixed Time"][m] for m in metrics]
mappo_vals = [data["MAPPO RL"][m] for m in metrics]

# Normalize to 0-1 scale based on fixed time (fixed = 1, lower = better)
max_vals = [max(fixed_vals[i], mappo_vals[i]) for i in range(N)]
fixed_norm = [v/m for v, m in zip(fixed_vals, max_vals)]
mappo_norm = [v/m for v, m in zip(mappo_vals, max_vals)]

angles = [n / float(N) * 2 * np.pi for n in range(N)]
fixed_norm += fixed_norm[:1]
mappo_norm += mappo_norm[:1]
angles += angles[:1]

ax.plot(angles, fixed_norm, 'o-', linewidth=2, label='Fixed Time', color=colors['Fixed Time'])
ax.fill(angles, fixed_norm, alpha=0.25, color=colors['Fixed Time'])
ax.plot(angles, mappo_norm, 'o-', linewidth=2, label='MAPPO RL', color=colors['MAPPO RL'])
ax.fill(angles, mappo_norm, alpha=0.25, color=colors['MAPPO RL'])

ax.set_xticks(angles[:-1])
ax.set_xticklabels(categories, fontsize=11)
ax.set_title('Performance Comparison\n(Smaller area = Better performance)', fontsize=14, fontweight='bold', pad=20)
ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.0))

plt.tight_layout()
plt.savefig('visualizations/03_radar_chart.png', dpi=150, bbox_inches='tight')
plt.close()
print("✓ Saved: visualizations/03_radar_chart.png")

# =============================================================================
# VISUALIZATION 4: Side-by-Side Queue Comparison (Main Metric)
# =============================================================================
fig, ax = plt.subplots(figsize=(8, 6))

x = np.arange(2)
width = 0.4

fixed_vals = [data["Fixed Time"]["mean_queue"], data["Fixed Time"]["steady_queue"]]
mappo_vals = [data["MAPPO RL"]["mean_queue"], data["MAPPO RL"]["steady_queue"]]

bars1 = ax.bar(x - width/2, fixed_vals, width, label='Fixed Time', color=colors['Fixed Time'], edgecolor='black')
bars2 = ax.bar(x + width/2, mappo_vals, width, label='MAPPO RL', color=colors['MAPPO RL'], edgecolor='black')

ax.set_ylabel('Queue Length (vehicles)', fontsize=12)
ax.set_title('Queue Length: Fixed Time vs MAPPO RL', fontsize=14, fontweight='bold')
ax.set_xticks(x)
ax.set_xticklabels(['Mean Queue', 'Steady-State Queue'], fontsize=11)
ax.legend()

for bars in [bars1, bars2]:
    for bar in bars:
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01, 
                f'{bar.get_height():.3f}', ha='center', va='bottom', fontsize=10, fontweight='bold')

# Add improvement annotations
ax.annotate(f'↓{improvements["mean_queue"]:.1f}%', xy=(0, mappo_vals[0]), xytext=(0, 0.3),
            fontsize=12, ha='center', color='#27ae60', fontweight='bold')
ax.annotate(f'↓{improvements["steady_queue"]:.1f}%', xy=(1, mappo_vals[1]), xytext=(1, 0.45),
            fontsize=12, ha='center', color='#27ae60', fontweight='bold')

plt.tight_layout()
plt.savefig('visualizations/04_queue_comparison.png', dpi=150, bbox_inches='tight')
plt.close()
print("✓ Saved: visualizations/04_queue_comparison.png")

# =============================================================================
# VISUALIZATION 5: Summary Infographic
# =============================================================================
fig, ax = plt.subplots(figsize=(12, 7))
ax.axis('off')

# Title
ax.text(0.5, 0.95, 'MAPPO Reinforcement Learning vs Fixed Time Control', 
        fontsize=20, fontweight='bold', ha='center', transform=ax.transAxes)
ax.text(0.5, 0.88, 'Traffic Signal Optimization - Sambalpur Network (15 Signals)', 
        fontsize=14, ha='center', transform=ax.transAxes, style='italic')

# Key metrics boxes
metrics_display = [
    ("Mean Queue", f"{improvements['mean_queue']:.1f}%", "↓"),
    ("Max Queue", f"{improvements['max_queue']:.1f}%", "↓"),
    ("Steady Queue", f"{improvements['steady_queue']:.1f}%", "↓"),
    ("Spillback", f"{improvements['spillback_rate']:.1f}%", "↓"),
]

for i, (name, val, arrow) in enumerate(metrics_display):
    x = 0.15 + i * 0.2
    # Box
    rect = plt.Rectangle((x-0.08, 0.45), 0.16, 0.35, transform=ax.transAxes, 
                          facecolor='#27ae60', edgecolor='black', linewidth=2, alpha=0.9)
    ax.add_patch(rect)
    # Text
    ax.text(x, 0.72, name, fontsize=11, ha='center', transform=ax.transAxes, 
            fontweight='bold', color='white')
    ax.text(x, 0.58, f'{arrow}{val}', fontsize=18, ha='center', transform=ax.transAxes, 
            fontweight='bold', color='white')
    ax.text(x, 0.50, 'Improvement', fontsize=9, ha='center', transform=ax.transAxes, color='white')

# Bottom comparison
ax.text(0.25, 0.25, 'Fixed Time Baseline', fontsize=14, ha='center', transform=ax.transAxes, fontweight='bold')
ax.text(0.25, 0.18, f"Mean Queue: {data['Fixed Time']['mean_queue']:.3f}", fontsize=11, ha='center', transform=ax.transAxes)
ax.text(0.25, 0.12, f"Spillback Rate: {data['Fixed Time']['spillback_rate']*100:.2f}%", fontsize=11, ha='center', transform=ax.transAxes)

ax.text(0.75, 0.25, 'MAPPO RL Policy', fontsize=14, ha='center', transform=ax.transAxes, fontweight='bold', color='#27ae60')
ax.text(0.75, 0.18, f"Mean Queue: {data['MAPPO RL']['mean_queue']:.3f}", fontsize=11, ha='center', transform=ax.transAxes)
ax.text(0.75, 0.12, f"Spillback Rate: {data['MAPPO RL']['spillback_rate']*100:.2f}%", fontsize=11, ha='center', transform=ax.transAxes)

# Arrow in middle
ax.annotate('', xy=(0.6, 0.20), xytext=(0.4, 0.20), transform=ax.transAxes,
            arrowprops=dict(arrowstyle='->', lw=3, color='#27ae60'))

plt.savefig('visualizations/05_summary_infographic.png', dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: visualizations/05_summary_infographic.png")

print("\n" + "="*60)
print("ALL VISUALIZATIONS GENERATED SUCCESSFULLY!")
print("="*60)
print("\nFiles in visualizations/:")
print("  01_all_metrics_comparison.png")
print("  02_improvement_percentage.png")
print("  03_radar_chart.png")
print("  04_queue_comparison.png")
print("  05_summary_infographic.png")
