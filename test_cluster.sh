#!/bin/bash
set -eo pipefail

export SOLO_NAMESPACE=solo-ns
export SOLO_DEPLOYMENT=${SOLO_NAMESPACE}
export SOLO_CLUSTER_NAME=solo-e2e-c1
export SOLO_CLUSTER_REF=kind-${SOLO_CLUSTER_NAME} # TODO revert
export SOLO_CLUSTER_SETUP_NAMESPACE=${SOLO_NAMESPACE}
export CN_LOCAL_BUILD_PATH=../hiero-consensus-node/hedera-node/data

for cluster in $(kind get clusters);do kind delete cluster -n $cluster;done
rm -Rf ~/.solo

export SOLO_CLUSTER_NAME=solo-e2e # TODO remove
task dual-cluster-setup # TODO remove
export SOLO_CLUSTER_NAME=solo-e2e-c1 # TODO remove

#task build
export SOLO_COMMAND=(npx @hashgraph/solo --)


export SOLO_COMMAND=(npx @hashgraph/solo --)

"${SOLO_COMMAND[@]}" init

#"${SOLO_COMMAND[@]}" cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev

"${SOLO_COMMAND[@]}" cluster-ref connect --cluster-ref ${SOLO_CLUSTER_REF} --context kind-${SOLO_CLUSTER_NAME} --dev

"${SOLO_COMMAND[@]}" deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev

"${SOLO_COMMAND[@]}" deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF} --num-consensus-nodes 2 --dev

"${SOLO_COMMAND[@]}" node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev

