#!/usr/bin/env bash
set -eo pipefail

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly CLUSTER_DIAGNOSTICS_PATH="${SCRIPT_PATH}/diagnostics/cluster"
readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin

if [[ -n "${SOLO_TEST_CLUSTER}" ]]; then
  SOLO_CLUSTER_NAME="${SOLO_TEST_CLUSTER}"
elif [[ -z "${SOLO_CLUSTER_NAME}" ]]; then
  SOLO_CLUSTER_NAME="solo-e2e"
fi

if [[ -z "${SOLO_CLUSTER_DUALITY}" ]]; then
  SOLO_CLUSTER_DUALITY=2
elif [[ "${SOLO_CLUSTER_DUALITY}" -lt 1 ]]; then
  SOLO_CLUSTER_DUALITY=1
elif [[ "${SOLO_CLUSTER_DUALITY}" -gt 2 ]]; then
  SOLO_CLUSTER_DUALITY=2
fi

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  kind delete cluster -n "${SOLO_CLUSTER_NAME}-c${i}" || true
done

docker network rm -f kind || true
docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge

# Setup Helm Repos
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo add metallb https://metallb.github.io/metallb

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  kind create cluster -n "${SOLO_CLUSTER_NAME}-c${i}" --image "${KIND_IMAGE}" --config "${SCRIPT_PATH}/kind-cluster-${i}.yaml" || exit 1


  sleep 10 # wait for control plane to come up

  kubectl config set-context kind-${SOLO_CLUSTER_NAME}


  echo "SOLO_CLUSTER_NAME **** = ${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image quay.io/frrouting/frr:9.1.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image busybox:1.36.1 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image curlimages/curl:8.9.1 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image envoyproxy/envoy:v1.21.1 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/hashgraph/solo-containers/backup-uploader:0.35.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/hashgraph/solo-containers/ubi8-init-java21:0.38.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/mhga24/envoyproxy/envoy:v1.22.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/mhga24/grafana/grafana:8.5.16 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/mhga24/minio/minio:latest --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/mhga24/postgres:latest --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/mhga24/prom/prometheus:v2.41.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image haproxytech/haproxy-alpine:2.4.25 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image quay.io/minio/operator:v5.0.7  --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image quay.io/minio/minio:RELEASE.2024-02-09T21-25-16Z  --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/hashgraph/solo-cheetah/cheetah:0.3.1 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image docker.io/otel/opentelemetry-collector-contrib:0.72.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # quay.io/jetstack/cert-manager-cainjector:v1.13.3
  kind load docker-image quay.io/jetstack/cert-manager-controller:v1.13.3 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # quay.io/jetstack/cert-manager-webhook:v1.13.3
  kind load docker-image quay.io/jetstack/cert-manager-webhook:v1.13.3 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # quay.io/jetstack/cert-manager-controller:v1.13.3
  kind load docker-image quay.io/jetstack/cert-manager-cainjector:v1.13.3 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # quay.io/jcmoraisjr/haproxy-ingress:v0.14.5
  kind load docker-image quay.io/jcmoraisjr/haproxy-ingress:v0.14.5 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # docker.io/bitnami/redis:7.4.2-debian-12-r6
  kind load docker-image docker.io/bitnami/redis:7.4.2-debian-12-r6 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # docker.io/bitnami/redis-sentinel:7.4.2-debian-12-r6
  kind load docker-image docker.io/bitnami/redis-sentinel:7.4.2-debian-12-r6 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image registry.k8s.io/metrics-server/metrics-server:v0.7.2 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image quay.io/metallb/controller:v0.15.2 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ubuntu:noble --name "${SOLO_CLUSTER_NAME}-c${i}"


  kind load docker-image gcr.io/mirrornode/hedera-mirror-grpc:0.131.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image gcr.io/mirrornode/hedera-mirror-importer:0.131.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image gcr.io/mirrornode/hedera-mirror-monitor:0.131.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image gcr.io/mirrornode/hedera-mirror-rest:0.131.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image gcr.io/mirrornode/hedera-mirror-rest-java:0.131.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image gcr.io/mirrornode/hedera-mirror-web3:0.131.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image docker.io/bitnami/postgresql-repmgr:17.4.0-debian-12-r15 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image docker.io/bitnami/postgresql:16.4.0 --name "${SOLO_CLUSTER_NAME}-c${i}"

  kind load docker-image ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.67.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  kind load docker-image ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer:25.0.0 --name "${SOLO_CLUSTER_NAME}-c${i}"
  # Deploy the metrics-server if not running in CI
  if [[ -z "${CI}" ]]; then
    helm upgrade --install metrics-server metrics-server/metrics-server \
      --namespace kube-system \
      --set "args[0]=--kubelet-insecure-tls"
  fi

  helm upgrade --install metallb metallb/metallb \
    --namespace metallb-system --create-namespace --atomic --wait \
    --set speaker.frr.enabled=true

  kubectl apply -f "${SCRIPT_PATH}/metallb-cluster-${i}.yaml"

  # Deploy the diagnostics container if not running in CI
  if [[ -z "${CI}" ]]; then
    "${CLUSTER_DIAGNOSTICS_PATH}"/deploy.sh
  fi
done

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# --chart-dir ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
task build
npm run solo -- init || exit 1 # cache args for subsequent commands

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c${i}"
  npm run solo -- cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
  helm list --all-namespaces
done

kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c1"
sleep 10 # give time for solo-setup to finish deploying
