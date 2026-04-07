#!/bin/bash
set -eo pipefail
#set -x

#task build

#npm install -g @hashgraph/solo@0.38.0

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-deployment

export CONSENSUS_NODE_VERSION=$(grep -A1 "HEDERA_PLATFORM_VERSION" ../../version.ts | grep -o "'[^']*'" | tail -1 | sed "s/'//g")
echo "Upgrading consensus network to version: ${CONSENSUS_NODE_VERSION}"
export PREV_CN_VERSION="v0.68.6"
export PREV_BLOCK_VERSION="v0.26.1"

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*; rm -rf test/data/tmp/*;

./scripts/kind-images.sh load /tmp/kind-images.json "${SOLO_CLUSTER_NAME}"
