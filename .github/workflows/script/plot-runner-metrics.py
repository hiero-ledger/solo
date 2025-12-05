#!/usr/bin/env python3
"""
Plot runner resource metrics from CSV file.

Usage:
    python plot-runner-metrics.py runner-metrics.csv

This will generate runner-metrics.png with CPU and Memory usage charts.
"""

import sys
import csv
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

def plot_metrics(csv_file: str) -> None:
    """Read CSV and generate resource usage charts."""
    
    timestamps: list = []
    cpu_percent: list = []
    mem_percent: list = []
    
    # Read CSV file
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                timestamps.append(datetime.strptime(row['timestamp'], '%Y-%m-%d %H:%M:%S'))
                cpu_percent.append(float(row['cpu_percent']))
                mem_percent.append(float(row['mem_percent']))
            except (ValueError, KeyError) as e:
                print(f"Warning: Skipping invalid row: {e}")
                continue
    
    if not timestamps:
        print("Error: No valid data found in CSV file")
        sys.exit(1)
    
    if len(timestamps) < 2:
        print("Warning: Only 1 data point found, duration will be 0")
    
    # Create figure with 2 subplots - very small size for embedding
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6, 4))
    fig.suptitle('GitHub Runner Resource Usage', fontsize=10, fontweight='bold')
    
    # Use grayscale colors for smaller file size
    line_color = '#000000'      # Black
    fill_color = '#666666'      # Dark gray
    threshold_80 = '#999999'    # Light gray
    threshold_95 = '#333333'    # Dark gray
    
    # CPU Usage
    ax1.plot(timestamps, cpu_percent, color=line_color, linewidth=1.5)
    ax1.fill_between(timestamps, cpu_percent, alpha=0.2, color=fill_color)
    ax1.set_ylabel('CPU Usage (%)', fontsize=9)
    ax1.set_ylim(0, 100)
    ax1.grid(True, alpha=0.3, linewidth=0.5)
    ax1.axhline(y=80, color=threshold_80, linestyle='--', alpha=0.6, linewidth=1, label='80%')
    ax1.axhline(y=95, color=threshold_95, linestyle='--', alpha=0.6, linewidth=1, label='95%')
    ax1.legend(loc='upper right', fontsize=8)
    
    # Memory Usage
    ax2.plot(timestamps, mem_percent, color=line_color, linewidth=1.5)
    ax2.fill_between(timestamps, mem_percent, alpha=0.2, color=fill_color)
    ax2.set_ylabel('Memory Usage (%)', fontsize=9)
    ax2.set_xlabel('Time (UTC)', fontsize=9)
    ax2.set_ylim(0, 100)
    ax2.grid(True, alpha=0.3, linewidth=0.5)
    ax2.axhline(y=80, color=threshold_80, linestyle='--', alpha=0.6, linewidth=1, label='80%')
    ax2.axhline(y=95, color=threshold_95, linestyle='--', alpha=0.6, linewidth=1, label='95%')
    ax2.legend(loc='upper right', fontsize=8)
    
    # Format x-axis for all subplots
    for ax in [ax1, ax2]:
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha='right')
    
    plt.tight_layout(rect=[0, 0.0, 1, 0.96])
    
    # Save figure as WebP with maximum compression for embedding
    output_file: str = csv_file.replace('.csv', '.webp')
    plt.savefig(
        output_file,
        format='webp',
        dpi=60,              # Very low DPI for smallest file
        bbox_inches='tight',
        facecolor='white',   # White background
        edgecolor='none',
        pil_kwargs={'quality': 60, 'method': 6}  # Lower quality, best compression method
    )
    print(f"Chart saved to: {output_file}")
    
    # Print summary
    print("\n=== Resource Usage Summary ===")
    print(f"Peak CPU: {max(cpu_percent):.1f}%")
    print(f"Peak Memory: {max(mem_percent):.1f}%")
    duration_minutes: float = (timestamps[-1] - timestamps[0]).total_seconds() / 60 if len(timestamps) > 1 else 0.0
    print(f"Duration: {duration_minutes:.1f} minutes")

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python plot-runner-metrics.py <csv-file>")
        sys.exit(1)
    
    plot_metrics(sys.argv[1])
