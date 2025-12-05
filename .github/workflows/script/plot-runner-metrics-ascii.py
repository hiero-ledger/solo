#!/usr/bin/env python3
"""
Generate ASCII chart for runner resource metrics from CSV file.

Usage:
    python plot-runner-metrics-ascii.py runner-metrics.csv

This will output an ASCII chart to stdout and save to a .txt file.
"""

import sys
import csv
from datetime import datetime
from typing import List, Tuple


def create_ascii_chart(values: List[float], height: int = 15, width: int = 60, 
                       max_val: float = 100.0, title: str = "") -> str:
    """Create an ASCII line chart."""
    if not values:
        return "No data"
    
    # Normalize values to chart height
    normalized: List[int] = [int((v / max_val) * height) for v in values]
    
    # Create chart grid
    chart_lines: List[str] = []
    
    # Title
    if title:
        chart_lines.append(title)
        chart_lines.append("─" * width)
    
    # Y-axis labels and chart
    for y in range(height, -1, -1):
        # Y-axis label
        percent: float = (y / height) * max_val
        label: str = f"{percent:5.1f}% │"
        
        # Plot line
        line: str = ""
        for x, norm_val in enumerate(normalized):
            if x >= width:
                break
            if norm_val >= y:
                line += "█"
            elif norm_val == y - 1:
                line += "▄"
            else:
                line += " "
        
        chart_lines.append(label + line)
    
    # X-axis
    chart_lines.append("       └" + "─" * min(len(normalized), width))
    
    return "\n".join(chart_lines)


def create_sparkline(values: List[float], width: int = 60) -> str:
    """Create a compact sparkline chart."""
    if not values:
        return ""
    
    # Sparkline characters from low to high
    chars: str = "▁▂▃▄▅▆▇█"
    max_val: float = max(values) if values else 1.0
    min_val: float = min(values) if values else 0.0
    range_val: float = max_val - min_val if max_val != min_val else 1.0
    
    # Normalize and map to characters
    sparkline: str = ""
    for val in values[:width]:
        normalized: float = (val - min_val) / range_val
        idx: int = min(int(normalized * len(chars)), len(chars) - 1)
        sparkline += chars[idx]
    
    return sparkline


def plot_metrics_ascii(csv_file: str) -> str:
    """Read CSV and generate ASCII resource usage charts."""
    
    timestamps: List[datetime] = []
    cpu_percent: List[float] = []
    mem_percent: List[float] = []
    
    # Read CSV file
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                timestamps.append(datetime.strptime(row['timestamp'], '%Y-%m-%d %H:%M:%S'))
                cpu_percent.append(float(row['cpu_percent']))
                mem_percent.append(float(row['mem_percent']))
            except (ValueError, KeyError) as e:
                print(f"Warning: Skipping invalid row: {e}", file=sys.stderr)
                continue
    
    if not timestamps:
        return "Error: No valid data found in CSV file"
    
    # Calculate summary stats
    peak_cpu: float = max(cpu_percent) if cpu_percent else 0.0
    peak_mem: float = max(mem_percent) if mem_percent else 0.0
    avg_cpu: float = sum(cpu_percent) / len(cpu_percent) if cpu_percent else 0.0
    avg_mem: float = sum(mem_percent) / len(mem_percent) if mem_percent else 0.0
    duration_minutes: float = (timestamps[-1] - timestamps[0]).total_seconds() / 60 if len(timestamps) > 1 else 0.0
    
    # Build output
    output: List[str] = []
    output.append("")
    output.append("╔═══════════════════════════════════════════════════════════════╗")
    output.append("║          GitHub Runner Resource Usage                         ║")
    output.append("╚═══════════════════════════════════════════════════════════════╝")
    output.append("")
    
    # Detailed ASCII charts
    output.append("📉 CPU Usage")
    output.append(create_ascii_chart(cpu_percent, height=10, width=50, title=""))
    output.append("")
    
    output.append("📉 Memory Usage")
    output.append(create_ascii_chart(mem_percent, height=10, width=50, title=""))
    output.append("")
    
    # Thresholds warning only
    if peak_cpu > 95 or peak_mem > 95:
        output.append("⚠️  WARNING: Resource usage exceeded 95% threshold!")
        output.append(f"    CPU Peak: {peak_cpu:.1f}%  |  Memory Peak: {peak_mem:.1f}%")
    elif peak_cpu > 80 or peak_mem > 80:
        output.append("⚡ NOTICE: Resource usage exceeded 80% threshold")
        output.append(f"    CPU Peak: {peak_cpu:.1f}%  |  Memory Peak: {peak_mem:.1f}%")
    else:
        output.append("✅ Resource usage within normal limits")
        output.append(f"    CPU Peak: {peak_cpu:.1f}%  |  Memory Peak: {peak_mem:.1f}%")
    
    output.append("")
    
    return "\n".join(output)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python plot-runner-metrics-ascii.py <csv-file>")
        sys.exit(1)
    
    csv_file: str = sys.argv[1]
    ascii_chart: str = plot_metrics_ascii(csv_file)
    
    # Print to stdout
    print(ascii_chart)
    
    # Save to file
    output_file: str = csv_file.replace('.csv', '-ascii.txt')
    with open(output_file, 'w') as f:
        f.write(ascii_chart)
    
    print(f"\nASCII chart saved to: {output_file}", file=sys.stderr)
