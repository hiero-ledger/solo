#!/usr/bin/env bash
set -euo pipefail

pkill -TERM -f 'com\.hedera\.node\.app\.ServicesMain' || true

# wait up to 60s for process to terminate
timeout 60s bash -lc "while pgrep -f 'com\\.hedera\\.node\\.app\\.ServicesMain' >/dev/null; do sleep 2; done" || true
