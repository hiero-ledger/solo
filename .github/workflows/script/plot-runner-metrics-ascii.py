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
from typing import List


def create_ascii_chart(values: List[float], height: int = 15, width: int = 60,
                       max_val: float = 100.0, title: str = "") -> str:
    """Create an ASCII line chart."""
    if not values:
        return "No data"

    # Validate parameters to prevent division by zero
    if height <= 0:
        raise ValueError("height must be greater than 0")
    if max_val <= 0:
        raise ValueError("max_val must be greater than 0")
    if width <= 0:
        raise ValueError("width must be greater than 0")

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

    # Calculate peak stats and duration
    peak_cpu: float = max(cpu_percent) if cpu_percent else 0.0
    peak_mem: float = max(mem_percent) if mem_percent else 0.0
    duration_minutes: float = (timestamps[-1] - timestamps[0]).total_seconds() / 60 if len(timestamps) > 1 else 0.0

    # Build output
    output: List[str] = []
    output.append("")
    output.append("╔═══════════════════════════════════════════════════════════════╗")
    output.append("║          GitHub Runner Resource Usage                         ║")
    output.append("╚═══════════════════════════════════════════════════════════════╝")
    output.append("")
    output.append(f"⏱️  Test Duration: {duration_minutes:.1f} minutes ({len(timestamps)} data points)")
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

    try:
        ascii_chart: str = plot_metrics_ascii(csv_file)
    except FileNotFoundError:
        print(f"Error: CSV file not found: {csv_file}", file=sys.stderr)
        sys.exit(1)
    except PermissionError:
        print(f"Error: Permission denied reading file: {csv_file}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading CSV file: {e}", file=sys.stderr)
        sys.exit(1)

    # Print to stdout
    print(ascii_chart)

    # Save to file
    output_file: str = csv_file.replace('.csv', '-ascii.txt')
    try:
        with open(output_file, 'w') as f:
            f.write(ascii_chart)
        print(f"\nASCII chart saved to: {output_file}", file=sys.stderr)
    except PermissionError:
        print(f"Error: Permission denied writing to file: {output_file}", file=sys.stderr)
        sys.exit(1)
    except OSError as e:
        print(f"Error writing output file: {e}", file=sys.stderr)
        sys.exit(1)
