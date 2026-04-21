#!/bin/bash
set -eo pipefail

#
# Compute the median of newline-separated integers from stdin.
# Prints a single integer to stdout.
# Usage: echo -e "10\n30\n20" | ./compute-median.sh
#

sort -n | awk '
  { a[NR] = $1 }
  END {
    n = NR
    if (n == 0) { print 0; exit }
    if (n % 2 == 1) print a[(n + 1) / 2]
    else            print int((a[n / 2] + a[n / 2 + 1]) / 2)
  }
'
