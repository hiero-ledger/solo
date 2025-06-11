#!/bin/bash

# This script is used to run some common solo commands, and use the output to update
# the docs/site/content/en/docs/step-by-step-guide.md file. This is useful to keep the guide up to date

set -xeo pipefail

export TARGET_DIR=docs/site/content/en/docs
export TARGET_FILE=${TARGET_DIR}/step-by-step-guide.md
export BUILD_DIR=docs/site/build
mkdir -p ${BUILD_DIR}

if [[ -z "${SOLO_TEST_CLUSTER}" && ${SOLO_CLUSTER_NAME} == "" ]]; then
  SOLO_CLUSTER_NAME=solo-e2e
else
  SOLO_CLUSTER_NAME=${SOLO_TEST_CLUSTER}
fi

# TBD, need to use at least version v0.62.6 for block node commands to work
CONSENSUS_NODE_VERSION=${1:-v0.62.6}
CONSENSUS_NODE_FLAG=() # Initialize an empty array

if [[ -n "${CONSENSUS_NODE_VERSION}" ]]; then
  CONSENSUS_NODE_FLAG=(--release-tag "${CONSENSUS_NODE_VERSION}")
fi

export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster-setup
export SOLO_DEPLOYMENT=solo-deployment
export SOLO_EMAIL=john@doe.com

echo "Perform the following kind and solo commands and save output to environment variables"

kind create cluster -n "${SOLO_CLUSTER_NAME}" 2>&1 | tee ${BUILD_DIR}/create-cluster.log
export KIND_CREATE_CLUSTER_OUTPUT=$( cat ${BUILD_DIR}/create-cluster.log | tee ${BUILD_DIR}/test.log )

solo init | tee ${BUILD_DIR}/init.log
export SOLO_INIT_OUTPUT=$( cat ${BUILD_DIR}/init.log | tee ${BUILD_DIR}/test.log )

solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} | tee ${BUILD_DIR}/cluster-ref-connect.log
export SOLO_CLUSTER_REF_CONNECT_OUTPUT=$( cat ${BUILD_DIR}/cluster-ref-connect.log | tee ${BUILD_DIR}/test.log )

solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/deployment-create.log
export SOLO_DEPLOYMENT_CREATE_OUTPUT=$( cat ${BUILD_DIR}/deployment-create.log | tee ${BUILD_DIR}/test.log )

solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1 | tee ${BUILD_DIR}/deployment-add-cluster.log
export SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT=$( cat ${BUILD_DIR}/deployment-add-cluster.log | tee ${BUILD_DIR}/test.log )

solo node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/keys.log
export SOLO_NODE_KEY_PEM_OUTPUT=$( cat ${BUILD_DIR}/keys.log | tee ${BUILD_DIR}/test.log )

solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" | tee ${BUILD_DIR}/cluster-setup.log
export SOLO_CLUSTER_SETUP_OUTPUT=$( cat ${BUILD_DIR}/cluster-setup.log | tee ${BUILD_DIR}/test.log )

solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" "${CONSENSUS_NODE_FLAG[@]}" | tee ${BUILD_DIR}/block-node-add.log
export SOLO_BLOCK_NODE_ADD_OUTPUT=$( cat ${BUILD_DIR}/block-node-add.log | tee ${BUILD_DIR}/test.log )

solo network deploy --deployment "${SOLO_DEPLOYMENT}" "${CONSENSUS_NODE_FLAG[@]}" | tee ${BUILD_DIR}/network-deploy.log
export SOLO_NETWORK_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/network-deploy.log | tee ${BUILD_DIR}/test.log )

solo node setup --deployment "${SOLO_DEPLOYMENT}" "${CONSENSUS_NODE_FLAG[@]}" | tee ${BUILD_DIR}/node-setup.log
export SOLO_NODE_SETUP_OUTPUT=$( cat ${BUILD_DIR}/node-setup.log | tee ${BUILD_DIR}/test.log )

solo node start --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/node-start.log
export SOLO_NODE_START_OUTPUT=$( cat ${BUILD_DIR}/node-start.log | tee ${BUILD_DIR}/test.log )

# shellcheck disable=SC2086
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} -q | tee ${BUILD_DIR}/mirror-node-deploy.log
export SOLO_MIRROR_NODE_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/mirror-node-deploy.log | tee ${BUILD_DIR}/test.log )

solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} -q | tee ${BUILD_DIR}/explorer-deploy.log
export SOLO_EXPLORER_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/explorer-deploy.log | tee ${BUILD_DIR}/test.log )

solo relay deploy -i node1 --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/relay-deploy.log
export SOLO_RELAY_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/relay-deploy.log | tee ${BUILD_DIR}/test.log )

solo relay destroy -i node1 --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/relay-destroy.log
export SOLO_RELAY_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/relay-destroy.log | tee ${BUILD_DIR}/test.log )

solo mirror-node destroy --deployment "${SOLO_DEPLOYMENT}" --force -q | tee ${BUILD_DIR}/mirror-node-destroy.log
export SOLO_MIRROR_NODE_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/mirror-node-destroy.log | tee ${BUILD_DIR}/test.log )

solo explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force -q | tee ${BUILD_DIR}/explorer-destroy.log
export SOLO_EXPLORER_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/explorer-destroy.log | tee ${BUILD_DIR}/test.log )

solo network destroy --deployment "${SOLO_DEPLOYMENT}" --force -q | tee ${BUILD_DIR}/network-destroy.log
export SOLO_NETWORK_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/network-destroy.log | tee ${BUILD_DIR}/test.log )

solo block node destroy --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/block-node-destroy.log
export SOLO_BLOCK_NODE_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/block-node-destroy.log | tee ${BUILD_DIR}/test.log )

pushd ../
echo "Generating ${TARGET_FILE} from ${TARGET_FILE}.template"

envsubst '$KIND_CREATE_CLUSTER_OUTPUT,$SOLO_INIT_OUTPUT,$SOLO_NODE_KEY_PEM_OUTPUT,$SOLO_CLUSTER_SETUP_OUTPUT, \
$SOLO_DEPLOYMENT_CREATE_OUTPUT,$SOLO_NETWORK_DEPLOY_OUTPUT,$SOLO_NODE_SETUP_OUTPUT,$SOLO_NODE_START_OUTPUT,\
$SOLO_MIRROR_NODE_DEPLOY_OUTPUT,$SOLO_RELAY_DEPLOY_OUTPUT,$SOLO_CLUSTER_REF_CONNECT_OUTPUT,$SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT,\
$SOLO_EXPLORER_DEPLOY_OUTPUT,$SOLO_BLOCK_NODE_ADD_OUTPUT,$SOLO_RELAY_DESTROY_OUTPUT,$SOLO_MIRROR_NODE_DESTROY_OUTPUT,$SOLO_EXPLORER_DESTROY_OUTPUT,\
$SOLO_BLOCK_NODE_DESTROY_OUTPUT,$SOLO_NETWORK_DESTROY_OUTPUT'\
< ${TARGET_FILE}.template > ${TARGET_FILE}

echo "Remove color codes and lines showing intermediate progress"

sed -i 's/\[32m//g' ${TARGET_FILE}
sed -i 's/\[33m//g' ${TARGET_FILE}
sed -i 's/\[39m//g' ${TARGET_FILE}
egrep -v '↓|❯|•' ${TARGET_FILE} > ${TARGET_FILE}.tmp && mv ${TARGET_FILE}.tmp ${TARGET_FILE}

popd
set +x
