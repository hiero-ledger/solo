#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Cleanup old state rounds - keep only the latest/biggest round
#
# This script is executed after state files are extracted to remove old round
# directories and conserve disk space. Only the most recent round is retained.
#
# Usage: cleanup-state-rounds.sh <hedera_hapi_path>
#
# Example: cleanup-state-rounds.sh /opt/hgcapp/services-hedera/HapiApp2.0

HEDERA_HAPI_PATH="${1:-/opt/hgcapp/services-hedera/HapiApp2.0}"
STATE_DIR="${HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain"

echo "Cleaning up old state rounds in ${STATE_DIR}"

cd "${STATE_DIR}" || exit 0

for nodeid in */; do
  [ -d "$nodeid" ] || continue
  cd "$nodeid" || continue
  
  for realmShard in */; do
    [ -d "$realmShard" ] || continue
    cd "$realmShard" || continue
    
    # Find all numeric round directories and keep only the largest
    rounds=$(find . -maxdepth 1 -type d -name '[0-9]*' | sed 's|./||' | sort -n)
    
    if [ -n "$rounds" ]; then
      latest_round=$(echo "$rounds" | tail -n 1)
      round_count=$(echo "$rounds" | wc -l)
      
      echo "Node ${nodeid}${realmShard}: Found ${round_count} rounds, keeping latest: ${latest_round}"
      
      for round in $rounds; do
        if [ "$round" != "$latest_round" ]; then
          echo "  Removing old round: $round"
          rm -rf "$round"
        fi
      done
    fi
    
    cd ../..
  done
  cd ..
done

echo "State round cleanup completed"
