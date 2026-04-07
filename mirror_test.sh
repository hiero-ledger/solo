#!/bin/bash
set -eo pipefail

#task build

#npm install -g @hashgraph/solo@0.38.0

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-deployment

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*; rm -rf test/data/tmp/*;
#cp /Users/jeffrey/Documents/kind-darwin-arm64  ~/Downloads/

  kind load docker-image \
    quay.io/minio/minio:RELEASE.2024-02-09T21-25-16Z \
    quay.io/prometheus-operator/prometheus-config-reloader:v0.68.0 \
    quay.io/prometheus-operator/prometheus-operator:v0.68.0 \
    quay.io/prometheus/alertmanager:v0.26.0 \
    quay.io/prometheus/node-exporter:v1.6.1 \
    quay.io/prometheus/prometheus:v2.47.1 \
    quay.io/minio/operator:v7.1.1 \
    quay.io/minio/operator-sidecar:v7.0.1 \
    registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.10.0 \
    ghcr.io/hiero-ledger/hiero-block-node:0.21.1 \
    quay.io/metallb/controller:v0.15.2 \
    quay.io/metallb/speaker:v0.15.2 \
    curlimages/curl:8.9.1 \
    busybox:1.36.1 \
    envoyproxy/envoy:v1.21.1 \
    haproxytech/haproxy-alpine:2.4.25 \
    ghcr.io/hashgraph/solo-containers/backup-uploader:0.35.0 \
    ghcr.io/hashgraph/solo-containers/ubi8-init-java21:0.38.1 \
    ghcr.io/mhga24/envoyproxy/envoy:v1.22.0 \
    quay.io/minio/operator:v5.0.7 busybox \
    ghcr.io/hashgraph/solo-cheetah/cheetah:0.3.1 \
    docker.io/otel/opentelemetry-collector-contrib:0.72.0 \
    --name "${SOLO_CLUSTER_NAME}"

npm run solo-test -- cluster-ref config connect --context kind-${SOLO_CLUSTER_NAME}
npm run solo-test -- deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --num-consensus-nodes 2
npm run solo-test -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

npm run solo-test -- keys consensus generate --gossip-keys --tls-keys -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2 --dev
npm run solo-test -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
#npm run solo-test -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"


#kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data."remote-config-data"' | yq '.versions' || true

#n#npm run solo-test -- node stop --deployment "${SOLO_DEPLOYMENT}"

  kind load docker-image \
    ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.70.0 \
    ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer:25.1.1 \
    quay.io/jetstack/cert-manager-controller:v1.13.3 \
    quay.io/jetstack/cert-manager-webhook:v1.13.3 \
    quay.io/jetstack/cert-manager-cainjector:v1.13.3 \
    quay.io/jcmoraisjr/haproxy-ingress:v0.14.5 \
    gcr.io/mirrornode/hedera-mirror-grpc:0.141.0 \
    gcr.io/mirrornode/hedera-mirror-importer:0.141.0 \
    gcr.io/mirrornode/hedera-mirror-monitor:0.141.0 \
    gcr.io/mirrornode/hedera-mirror-rest:0.141.0 \
    gcr.io/mirrornode/hedera-mirror-rest-java:0.141.0 \
    gcr.io/mirrornode/hedera-mirror-web3:0.141.0 \
    docker.io/bitnamilegacy/redis:8.2.1-debian-12-r0 \
    docker.io/bitnami/redis-sentinel:7.4.2-debian-12-r6 \
    --name "${SOLO_CLUSTER_NAME}"

npm run solo-test -- mirror node add --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --dev
#
#npm run solo-test -- relay node add --deployment "${SOLO_DEPLOYMENT}" -i  node1 -q --dev
#
#npm run solo-test -- relay destroy --deployment "${SOLO_DEPLOYMENT}"  --cluster-ref kind-solo-e2e  -i  node1

#npm run solo-test -- relay node add --deployment "${SOLO_DEPLOYMENT}" -i  node1 -q --dev --chart-dir /Users/jeffrey/hiero-json-rpc-relay/charts
#
#npm run solo-test -- explorer node add --deployment "${SOLO_DEPLOYMENT}" --mirrorNamespace solo-e2e -q --dev
#
#SKIP_IMPORTER_CHECK=true
#.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"

#npm run solo-test -- relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev
#

#npm run solo-test -- ledger account create --deployment "${SOLO_DEPLOYMENT}"
#npm run solo-test -- account get --account-id 0.0.1001 --deployment solo-e2e --private-key

