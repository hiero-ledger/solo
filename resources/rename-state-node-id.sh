#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Rename node ID directories in state files
#
# When copying a state file from one node to another, the directory structure
# contains the original node's ID which needs to be renamed to match the
# target node's ID.
#
# Usage: rename-state-node-id.sh <hedera_hapi_path> <old_node_id> <new_node_id>
#
# Example: rename-state-node-id.sh /opt/hgcapp/services-hedera/HapiApp2.0 0 1

HEDERA_HAPI_PATH="${1}"
OLD_NODE_ID="${2}"
NEW_NODE_ID="${3}"

if [ -z "$HEDERA_HAPI_PATH" ] || [ -z "$OLD_NODE_ID" ] || [ -z "$NEW_NODE_ID" ]; then
  echo "Error: Missing required arguments"
  echo "Usage: $0 <hedera_hapi_path> <old_node_id> <new_node_id>"
  exit 1
fi

if [ "$OLD_NODE_ID" = "$NEW_NODE_ID" ]; then
  echo "Old node ID and new node ID are the same ($OLD_NODE_ID), no renaming needed"
  exit 0
fi

STATE_DIR="${HEDERA_HAPI_PATH}/data/saved"
echo "Renaming node ID directories from ${OLD_NODE_ID} to ${NEW_NODE_ID} in ${STATE_DIR}"

cd "${STATE_DIR}" || exit 1

# Rename preconsensus-events/${OLD_NODE_ID} to preconsensus-events/${NEW_NODE_ID}
if [ -d "preconsensus-events/${OLD_NODE_ID}" ]; then
  echo "Renaming preconsensus-events/${OLD_NODE_ID} -> preconsensus-events/${NEW_NODE_ID}"
  mv "preconsensus-events/${OLD_NODE_ID}" "preconsensus-events/${NEW_NODE_ID}"
fi

# Rename com.hedera.services.ServicesMain/${OLD_NODE_ID} to com.hedera.services.ServicesMain/${NEW_NODE_ID}
if [ -d "com.hedera.services.ServicesMain/${OLD_NODE_ID}" ]; then
  echo "Renaming com.hedera.services.ServicesMain/${OLD_NODE_ID} -> com.hedera.services.ServicesMain/${NEW_NODE_ID}"
  mv "com.hedera.services.ServicesMain/${OLD_NODE_ID}" "com.hedera.services.ServicesMain/${NEW_NODE_ID}"
  
  # After renaming the main directory, we need to handle preconsensus-events inside round directories
  # Find all round directories and rename preconsensus-events/${OLD_NODE_ID} inside them
  for realmShard in com.hedera.services.ServicesMain/${NEW_NODE_ID}/*/; do
    [ -d "$realmShard" ] || continue
    for round in "${realmShard}"*/; do
      [ -d "$round" ] || continue
      if [ -d "${round}preconsensus-events/${OLD_NODE_ID}" ]; then
        echo "Renaming ${round}preconsensus-events/${OLD_NODE_ID} -> ${round}preconsensus-events/${NEW_NODE_ID}"
        mv "${round}preconsensus-events/${OLD_NODE_ID}" "${round}preconsensus-events/${NEW_NODE_ID}"
      fi
    done
  done
fi

# Rename saved/swirlds-recycle-bin/${OLD_NODE_ID} to saved/swirlds-recycle-bin/${NEW_NODE_ID}
if [ -d "saved/swirlds-recycle-bin/${OLD_NODE_ID}" ]; then
  echo "Renaming saved/swirlds-recycle-bin/${OLD_NODE_ID} -> saved/swirlds-recycle-bin/${NEW_NODE_ID}"
  mv "saved/swirlds-recycle-bin/${OLD_NODE_ID}" "saved/swirlds-recycle-bin/${NEW_NODE_ID}"
fi

# Also check for swirlds-tmp/${OLD_NODE_ID}-* directories
if ls swirlds-tmp/${OLD_NODE_ID}-* 1> /dev/null 2>&1; then
  for dir in swirlds-tmp/${OLD_NODE_ID}-*; do
    new_dir=$(echo "$dir" | sed "s/${OLD_NODE_ID}-/${NEW_NODE_ID}-/")
    echo "Renaming ${dir} -> ${new_dir}"
    mv "$dir" "$new_dir"
  done
fi

echo "Node ID renaming completed successfully"
