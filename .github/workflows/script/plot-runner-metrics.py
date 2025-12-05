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
    
    # Create figure with 2 subplots
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
    fig.suptitle('GitHub Runner Resource Usage', fontsize=16, fontweight='bold')
    
    # CPU Usage
    ax1.plot(timestamps, cpu_percent, color='#2E86AB', linewidth=2)
    ax1.fill_between(timestamps, cpu_percent, alpha=0.3, color='#2E86AB')
    ax1.set_ylabel('CPU Usage (%)', fontsize=12)
    ax1.set_ylim(0, 100)
    ax1.grid(True, alpha=0.3)
    ax1.axhline(y=80, color='orange', linestyle='--', alpha=0.5, label='80% threshold')
    ax1.axhline(y=95, color='red', linestyle='--', alpha=0.5, label='95% threshold')
    ax1.legend(loc='upper right')
    
    # Memory Usage
    ax2.plot(timestamps, mem_percent, color='#A23B72', linewidth=2)
    ax2.fill_between(timestamps, mem_percent, alpha=0.3, color='#A23B72')
    ax2.set_ylabel('Memory Usage (%)', fontsize=12)
    ax2.set_xlabel('Time (UTC)', fontsize=12)
    ax2.set_ylim(0, 100)
    ax2.grid(True, alpha=0.3)
    ax2.axhline(y=80, color='orange', linestyle='--', alpha=0.5, label='80% threshold')
    ax2.axhline(y=95, color='red', linestyle='--', alpha=0.5, label='95% threshold')
    ax2.legend(loc='upper right')
    
    # Format x-axis for all subplots
    for ax in [ax1, ax2]:
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha='right')
    
    plt.tight_layout(rect=[0, 0.0, 1, 0.96])
    
    # Save figure
    output_file: str = csv_file.replace('.csv', '.png')
    plt.savefig(output_file, dpi=150, bbox_inches='tight')
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
