#!/bin/bash

# This script is used to run some common solo commands, and use the output to update
# the docs/site/content/en/docs/step-by-step-guide.md file. This is useful to keep the guide up to date

set -xeo pipefail

export TARGET_DIR=docs/site/content/en
export TARGET_DIR_DOCS=docs/site/content/en/docs
export TEMPLATE_DIR=docs/site/content/en/templates
export TARGET_FILE=${TARGET_DIR_DOCS}/step-by-step-guide.md
export TEMPLATE_FILE=${TEMPLATE_DIR}/step-by-step-guide.template.md
export TEMPLATE_EXAMPLES_FILE=${TEMPLATE_DIR}/examples-index.template.md
export BUILD_DIR=docs/site/build
export EXAMPLES_DIR=examples
mkdir -p ${BUILD_DIR}
pwd


# TBD, need to use at least version v0.62.6 for block node commands to work
CONSENSUS_NODE_VERSION=${1:-v0.63.9}
CONSENSUS_NODE_FLAG=() # Initialize an empty array

if [[ -n "${CONSENSUS_NODE_VERSION}" ]]; then
  CONSENSUS_NODE_FLAG=(--release-tag "${CONSENSUS_NODE_VERSION}")
fi

export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment

kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
rm -Rf ~/.solo/cache || true
rm ~/.solo/local-config.yaml || true

echo "Perform the following kind and solo commands and save output to environment variables"

kind create cluster -n "${SOLO_CLUSTER_NAME}" 2>&1 | tee ${BUILD_DIR}/create-cluster.log
export KIND_CREATE_CLUSTER_OUTPUT=$( cat ${BUILD_DIR}/create-cluster.log | tee ${BUILD_DIR}/test.log )

solo init | tee ${BUILD_DIR}/init.log
export SOLO_INIT_OUTPUT=$( cat ${BUILD_DIR}/init.log | tee ${BUILD_DIR}/test.log )

solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} | tee ${BUILD_DIR}/cluster-ref-connect.log
export SOLO_CLUSTER_REF_CONNECT_OUTPUT=$( cat ${BUILD_DIR}/cluster-ref-connect.log | tee ${BUILD_DIR}/test.log )

solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/deployment-create.log
export SOLO_DEPLOYMENT_CREATE_OUTPUT=$( cat ${BUILD_DIR}/deployment-create.log | tee ${BUILD_DIR}/test.log )

solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1 | tee ${BUILD_DIR}/deployment-attach.log
export SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT=$( cat ${BUILD_DIR}/deployment-attach.log | tee ${BUILD_DIR}/test.log )

solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/keys.log
export SOLO_NODE_KEY_PEM_OUTPUT=$( cat ${BUILD_DIR}/keys.log | tee ${BUILD_DIR}/test.log )

solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" | tee ${BUILD_DIR}/cluster-setup.log
export SOLO_CLUSTER_SETUP_OUTPUT=$( cat ${BUILD_DIR}/cluster-setup.log | tee ${BUILD_DIR}/test.log )

solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" | tee ${BUILD_DIR}/block-node-add.log
export SOLO_BLOCK_NODE_ADD_OUTPUT=$( cat ${BUILD_DIR}/block-node-add.log | tee ${BUILD_DIR}/test.log )

solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" "${CONSENSUS_NODE_FLAG[@]}" | tee ${BUILD_DIR}/network-deploy.log
export SOLO_NETWORK_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/network-deploy.log | tee ${BUILD_DIR}/test.log )

solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" "${CONSENSUS_NODE_FLAG[@]}" | tee ${BUILD_DIR}/node-setup.log
export SOLO_NODE_SETUP_OUTPUT=$( cat ${BUILD_DIR}/node-setup.log | tee ${BUILD_DIR}/test.log )

solo consensus node start --deployment "${SOLO_DEPLOYMENT}" | tee ${BUILD_DIR}/node-start.log
export SOLO_NODE_START_OUTPUT=$( cat ${BUILD_DIR}/node-start.log | tee ${BUILD_DIR}/test.log )

# shellcheck disable=SC2086
solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress -q | tee ${BUILD_DIR}/mirror-node-add.log
export SOLO_MIRROR_NODE_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/mirror-node-add.log | tee ${BUILD_DIR}/test.log )

solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} -q | tee ${BUILD_DIR}/explorer-add.log
export SOLO_EXPLORER_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/explorer-deploy.log | tee ${BUILD_DIR}/test.log )

solo relay node add -i node1 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} | tee ${BUILD_DIR}/relay-add.log
export SOLO_RELAY_DEPLOY_OUTPUT=$( cat ${BUILD_DIR}/relay-add.log | tee ${BUILD_DIR}/test.log )

solo relay node destroy -i node1 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} | tee ${BUILD_DIR}/relay-destroy.log
export SOLO_RELAY_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/relay-destroy.log | tee ${BUILD_DIR}/test.log )

solo mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force -q | tee ${BUILD_DIR}/mirror-node-destroy.log
export SOLO_MIRROR_NODE_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/mirror-node-destroy.log | tee ${BUILD_DIR}/test.log )

solo explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force -q | tee ${BUILD_DIR}/explorer-destroy.log
export SOLO_EXPLORER_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/explorer-destroy.log | tee ${BUILD_DIR}/test.log )

solo block node destroy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} | tee ${BUILD_DIR}/block-node-destroy.log
export SOLO_BLOCK_NODE_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/block-node-destroy.log | tee ${BUILD_DIR}/test.log )

solo consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force -q | tee ${BUILD_DIR}/network-destroy.log
export SOLO_NETWORK_DESTROY_OUTPUT=$( cat ${BUILD_DIR}/network-destroy.log | tee ${BUILD_DIR}/test.log )

echo "Generating ${TARGET_FILE} from ${TEMPLATE_FILE}"

envsubst '$KIND_CREATE_CLUSTER_OUTPUT,$SOLO_INIT_OUTPUT,$SOLO_NODE_KEY_PEM_OUTPUT,$SOLO_CLUSTER_SETUP_OUTPUT, \
$SOLO_DEPLOYMENT_CREATE_OUTPUT,$SOLO_NETWORK_DEPLOY_OUTPUT,$SOLO_NODE_SETUP_OUTPUT,$SOLO_NODE_START_OUTPUT,\
$SOLO_MIRROR_NODE_DEPLOY_OUTPUT,$SOLO_RELAY_DEPLOY_OUTPUT,$SOLO_CLUSTER_REF_CONNECT_OUTPUT,$SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT,\
$SOLO_EXPLORER_DEPLOY_OUTPUT,$SOLO_BLOCK_NODE_ADD_OUTPUT,$SOLO_RELAY_DESTROY_OUTPUT,$SOLO_MIRROR_NODE_DESTROY_OUTPUT,$SOLO_EXPLORER_DESTROY_OUTPUT,\
$SOLO_BLOCK_NODE_DESTROY_OUTPUT,$SOLO_NETWORK_DESTROY_OUTPUT'\
< ${TEMPLATE_FILE} > ${TARGET_FILE}

# Extract the entire content from examples/README.md (excluding first line)
echo "Extracting content from examples README"
EXAMPLES_CONTENT=$(cat ${EXAMPLES_DIR}/README.md)
export EXAMPLES_CONTENT

# Create examples directory if it doesn't exist
mkdir -p ${TARGET_DIR}/examples

# Generate examples index page from template
echo "Generating examples index page from template"
envsubst '$EXAMPLES_CONTENT' < ${TEMPLATE_DIR}/examples-index.template.md > ${TARGET_DIR}/examples/_index.md

echo "Remove color codes and lines showing intermediate progress"

if [ "$(uname -s)" == "Linux" ]; then
  sed -i 's/\[32m//g' ${TARGET_FILE}
  sed -i 's/\[33m//g' ${TARGET_FILE}
  sed -i 's/\[39m//g' ${TARGET_FILE}
else
  # For macOS the -i requires a parameter
  sed -i '' 's/\[32m//g' ${TARGET_FILE}
  sed -i '' 's/\[33m//g' ${TARGET_FILE}
  sed -i '' 's/\[39m//g' ${TARGET_FILE}
fi


egrep -v '↓|❯|•' ${TARGET_FILE} > ${TARGET_FILE}.tmp && mv ${TARGET_FILE}.tmp ${TARGET_FILE}

set +x
