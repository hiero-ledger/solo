#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Cleanup old state rounds - keep only the latest usable round
#
# This script is executed after state files are extracted to remove old round
# directories and conserve disk space. The latest fully signed, non-freeze state
# is preferred; if metadata is unavailable, the numerically latest round is kept.
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
    
    # Find all numeric round directories and keep a fully signed, non-freeze
    # state when available. If the newest archived state is a freeze state, use
    # the latest signed non-freeze state so CN resumes with TSS already
    # established, avoiding TSS re-keying that would break block proof
    # verification against the backed-up tss-bootstrap-roster.json.
    rounds=$(find . -maxdepth 1 -type d -name '[0-9]*' | sed 's|./||' | sort -n)
    
    if [ -n "$rounds" ]; then
      latest_round=""
      highest_round=$(echo "$rounds" | tail -n 1)
      highest_round_freeze_state=""
      latest_signed_non_freeze_round=""
      for round in $rounds; do
        metadata_file="${round}/stateMetadata.txt"
        [ -f "$metadata_file" ] || continue

        freeze_state=$(awk -F: '/^FREEZE_STATE:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "$metadata_file")
        signing_weight=$(awk -F: '/^SIGNING_WEIGHT_SUM:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "$metadata_file")
        total_weight=$(awk -F: '/^TOTAL_WEIGHT:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "$metadata_file")

        if [ "$round" = "$highest_round" ]; then
          highest_round_freeze_state="$freeze_state"
        fi

        if [ "$freeze_state" = "false" ] && [ -n "$signing_weight" ] && [ "$signing_weight" = "$total_weight" ]; then
          latest_signed_non_freeze_round="$round"
          latest_round="$round"
        fi
      done

      if [ "$highest_round_freeze_state" = "true" ] && [ -n "$latest_signed_non_freeze_round" ]; then
        latest_round="$latest_signed_non_freeze_round"
      fi

      if [ -z "$latest_round" ]; then
        latest_round="$highest_round"
      fi

      round_count=$(echo "$rounds" | wc -l)
      
      echo "Node ${nodeid}${realmShard}: Found ${round_count} rounds, keeping state: ${latest_round}"
      
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
