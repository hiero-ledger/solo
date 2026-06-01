#!/usr/bin/env bash
# Push blocks into the consensus nodes by creating accounts in a loop. With a
# tiny blockStream.buffer.maxBlocks and node1's block node down, this saturates
# node1's buffer and trips back-pressure.
#
# Usage: generate-load.sh <solo-command> <deployment> <count>
#   solo-command - how to invoke solo, e.g. "npm run solo --" or "npx @hashgraph/solo"
#   deployment   - solo deployment name
#   count        - number of accounts to create
set -euo pipefail

SOLO_COMMAND="${1:?usage: generate-load.sh <solo-command> <deployment> <count>}"
DEPLOYMENT="${2:?missing deployment}"
COUNT="${3:?missing count}"

printf 'load: %s account-create txns ' "${COUNT}"
for i in $(seq 1 "${COUNT}"); do
  # '.' = ok, 'x' = this create failed (expected once node1 is back-pressured;
  # other nodes keep accepting). shellcheck disable=SC2086
  ${SOLO_COMMAND} ledger account create --deployment "${DEPLOYMENT}" --hbar-amount 1 >/dev/null 2>&1 \
    && printf '.' || printf 'x'
done
echo " done"
