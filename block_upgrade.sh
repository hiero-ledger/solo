#!/bin/bash
set -eo pipefail

task build

#npm install -g @hashgraph/solo@0.38.0

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-deployment

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*; rm -rf test/data/tmp/*; cp /Users/jeffrey/Documents/kind-darwin-arm64  ~/Downloads/

  kind load docker-image \
    quay.io/metallb/controller:v0.15.2 \
    quay.io/metallb/speaker:v0.15.2 \
    curlimages/curl:8.9.1 \
    busybox:1.36.1 \
    envoyproxy/envoy:v1.21.1 \
    haproxytech/haproxy-alpine:2.4.25 \
    ghcr.io/hashgraph/solo-containers/backup-uploader:0.35.0 \
    ghcr.io/hashgraph/solo-containers/ubi8-init-java21:0.38.0 \
    ghcr.io/mhga24/envoyproxy/envoy:v1.22.0 \
    quay.io/minio/operator:v5.0.7 \
    quay.io/minio/minio:RELEASE.2024-02-09T21-25-16Z \
    ghcr.io/hashgraph/solo-cheetah/cheetah:0.3.1 \
    docker.io/otel/opentelemetry-collector-contrib:0.72.0 \
    --name "${SOLO_CLUSTER_NAME}"

npm run solo-test -- init
npm run solo-test -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
npm run solo-test -- deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 2
npm run solo-test -- keys consensus generate --gossip-keys --tls-keys -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2 --values-file=new_container.yaml
npm run solo-test -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --local-build-path ../hiero-consensus-node/hedera-node/data/
npm run solo-test -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- block node add     --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --values-file=block.yaml

npm run solo-test -- block node upgrade --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --values-file=block.yaml


