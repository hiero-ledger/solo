#!/usr/bin/env bash
set -eo pipefail

#
# Dual-Cluster Kind Setup Script for E2E Testing
#
# This script sets up dual Kind clusters for end-to-end testing with LoadBalancer support.
#
# LOADBALANCER CONFIGURATION:
# ---------------------------
# This script supports two LoadBalancer providers: MetalLB and kube-vip
#
# To use MetalLB (default for macOS local testing):
#   export SOLO_ENABLE_METALLB=true
#   export SOLO_ENABLE_KUBE_VIP=false
#   # MetalLB will automatically assign IPs from the pool defined in metallb-cluster-*.yaml files
#   # Default IP ranges: 172.19.1.0/24 (cluster 1), 172.19.2.0/24 (cluster 2)
#
# To use kube-vip (recommended for GitHub Actions Linux runners):
#   export SOLO_ENABLE_METALLB=false
#   export SOLO_ENABLE_KUBE_VIP=true
#   export SOLO_KUBE_VIP_ADDRESSES=172.19.255.200,172.19.255.201
#   # kube-vip requires explicit IP addresses (one per cluster/node)
#   # The Solo CLI will annotate services with these IPs using: kube-vip.io/loadbalancerIPs
#
# ENVIRONMENT VARIABLES:
# ----------------------
# SOLO_TEST_CLUSTER         - Base cluster name (default: solo-e2e)
# SOLO_CLUSTER_DUALITY      - Number of clusters to create: 1 or 2 (default: 2)
# SOLO_ENABLE_METALLB       - Enable MetalLB LoadBalancer (default: false)
# SOLO_ENABLE_KUBE_VIP      - Enable kube-vip LoadBalancer (default: true)
# SOLO_KUBE_VIP_ADDRESSES   - Comma-separated IPs for kube-vip (default: 172.19.255.200,172.19.255.201)
# SOLO_KUBE_VIP_IMAGE       - kube-vip container image (default: ghcr.io/kube-vip/kube-vip:v0.9.2)
# SOLO_KUBE_VIP_INTERFACE   - Network interface for kube-vip (default: eth0)
# HELM_TIMEOUT_OVERRIDE     - Helm operation timeout (default: 10m0s)
# SOLO_KIND_CLUSTER_BACKOFF_SECONDS - Delay between cluster creation (default: 60s)
#
# NOTES:
# ------
# - MetalLB uses IP pools and L2Advertisement for automatic IP assignment
# - kube-vip requires per-service annotations managed by the Solo CLI
# - Both providers work on macOS; kube-vip is preferred for Linux CI environments
# - The Solo CLI automatically detects SOLO_USE_KUBE_VIP and applies annotations during deployment
#

install_kube_vip() {
  local cluster_name=$1
  local vip_address=$2
  local context="kind-${cluster_name}"

  if [[ -z "${vip_address}" ]]; then
    echo "No kube-vip address provided for ${cluster_name}; skipping kube-vip install"
    return
  fi

  kubectl config use-context "${context}"

  kubectl create namespace kube-vip --dry-run=client -o yaml | kubectl apply -f -

  cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kube-vip
  namespace: kube-vip
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kube-vip-role
rules:
  - apiGroups: [""]
    resources: ["services", "endpoints", "nodes", "pods"]
    verbs: ["get", "list", "watch", "update"]
  - apiGroups: [""]
    resources: ["services/status"]
    verbs: ["update"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch", "create", "update"]
  - apiGroups: ["coordination.k8s.io"]
    resources: ["leases"]
    verbs: ["get", "list", "watch", "create", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kube-vip-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kube-vip-role
subjects:
  - kind: ServiceAccount
    name: kube-vip
    namespace: kube-vip
EOF

  docker run --rm "${KUBE_VIP_IMAGE}" manifest daemonset \
    --services \
    --arp \
    --interface "${KUBE_VIP_INTERFACE}" \
    --leaderElection \
    --inCluster \
    --namespace kube-vip | sed 's/namespace: kube-system/namespace: kube-vip/' | kubectl apply -f -

  kubectl -n kube-vip set serviceaccount daemonset/kube-vip-ds kube-vip

  echo "Installed kube-vip v0.9.2 in cluster ${cluster_name}"
  echo "NOTE: Services require annotation 'kube-vip.io/loadbalancerIPs=${vip_address}' to get LoadBalancer IP"
}

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly CLUSTER_DIAGNOSTICS_PATH="${SCRIPT_PATH}/diagnostics/cluster"
readonly CLUSTER_LOG_DIR="${SCRIPT_PATH}/logs"
readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"
readonly HELM_TIMEOUT="${HELM_TIMEOUT_OVERRIDE:-10m0s}"
readonly KIND_CLUSTER_BACKOFF_SECONDS="${SOLO_KIND_CLUSTER_BACKOFF_SECONDS:-60}"
readonly ENABLE_METALLB="${SOLO_ENABLE_METALLB:-false}"
readonly ENABLE_KUBE_VIP="${SOLO_ENABLE_KUBE_VIP:-true}"
readonly KUBE_VIP_IMAGE="${SOLO_KUBE_VIP_IMAGE:-ghcr.io/kube-vip/kube-vip:v0.9.2}"
readonly KUBE_VIP_INTERFACE="${SOLO_KUBE_VIP_INTERFACE:-eth0}"
readonly KUBE_VIP_ADDRESSES="${SOLO_KUBE_VIP_ADDRESSES:-172.19.255.200,172.19.255.201}"
readonly KUBE_VIP_RANGE="${SOLO_KUBE_VIP_RANGE:-172.19.255.200-172.19.255.220}"
readonly KUBE_VIP_RANGE_CIDR="${SOLO_KUBE_VIP_RANGE_CIDR:-32}"
readonly KUBE_VIP_NETWORK="${SOLO_KUBE_VIP_NETWORK:-172.19.255.0/24}"
readonly ULIMIT_NOFILE="${SOLO_ULIMIT_NOFILE:-65536}"
readonly DOCKER_PRUNE_BETWEEN_CLUSTERS="${SOLO_DOCKER_PRUNE_BETWEEN_CLUSTERS:-false}"
IFS=',' read -r -a kube_vip_addresses <<< "${KUBE_VIP_ADDRESSES}"
IFS='-' read -r KUBE_VIP_RANGE_START KUBE_VIP_RANGE_STOP <<< "${KUBE_VIP_RANGE}"

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin
export SOLO_USE_KUBE_VIP=true
export SOLO_KUBE_VIP_ADDRESSES="${KUBE_VIP_ADDRESSES}"

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

if [[ -n "${CI}" ]]; then
  ulimit -n "${ULIMIT_NOFILE}" || true
fi

docker network rm -f kind || true
docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge

# Setup Helm Repos
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
if [[ "${ENABLE_METALLB}" == "true" ]]; then
  helm repo add metallb https://metallb.github.io/metallb
else
  echo "Skipping MetalLB Helm repo setup (SOLO_ENABLE_METALLB=${ENABLE_METALLB})"
fi

create_kind_cluster() {
  local cluster_name=$1
  local config_path=$2

  mkdir -p "${CLUSTER_LOG_DIR}"

  if ! kind create cluster --retain -n "${cluster_name}" --image "${KIND_IMAGE}" --config "${config_path}" --wait 5m; then
    local log_archive
    log_archive="${CLUSTER_LOG_DIR}/${cluster_name}-failed-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "${log_archive}" || true

    echo "ERROR: kind cluster creation failed for ${cluster_name}; exporting diagnostics to ${log_archive}" >&2

    kind export logs -n "${cluster_name}" "${log_archive}/kind" || true

    docker ps -a >"${log_archive}/docker-ps-a.txt" 2>&1 || true
    docker network ls >"${log_archive}/docker-network-ls.txt" 2>&1 || true

    local control_plane_container
    control_plane_container="${cluster_name}-control-plane"
    docker logs "${control_plane_container}" >"${log_archive}/docker-logs-control-plane.txt" 2>&1 || true

    docker exec --privileged "${control_plane_container}" journalctl --no-pager >"${log_archive}/journalctl.txt" 2>&1 || true
    docker exec --privileged "${control_plane_container}" journalctl --no-pager -u containerd.service >"${log_archive}/journalctl-containerd.txt" 2>&1 || true
    docker exec --privileged "${control_plane_container}" journalctl --no-pager -u kubelet.service >"${log_archive}/journalctl-kubelet.txt" 2>&1 || true

    echo "ERROR: kind cluster creation failed for ${cluster_name}." >&2
    echo "Diagnostics written under: ${log_archive}" >&2
    return 1
  fi
}

install_metrics_server() {
  helm upgrade --install metrics-server metrics-server/metrics-server \
    --namespace kube-system \
    --timeout "${HELM_TIMEOUT}" \
    --set "args[0]=--kubelet-insecure-tls"
}

install_metallb() {
  helm upgrade --install metallb metallb/metallb \
    --namespace metallb-system --create-namespace --atomic --wait \
    --timeout "${HELM_TIMEOUT}" \
    --set speaker.frr.enabled=true
}

# Phase 1: create Kind clusters
for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  cluster_name="${SOLO_CLUSTER_NAME}-c${i}"
  cluster_config="${SCRIPT_PATH}/kind-cluster-${i}.yaml"

  create_kind_cluster "${cluster_name}" "${cluster_config}"

  if [[ ${i} -lt ${SOLO_CLUSTER_DUALITY} ]]; then
    if [[ -n "${CI}" && "${DOCKER_PRUNE_BETWEEN_CLUSTERS}" == "true" ]]; then
      echo "Cleaning up Docker resources before next cluster..."
      docker system prune -f || true
    fi

    echo "Waiting ${KIND_CLUSTER_BACKOFF_SECONDS}s before creating the next cluster..."
    sleep "${KIND_CLUSTER_BACKOFF_SECONDS}"
  fi
done

# Phase 2: install cluster add-ons
for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  cluster_name="${SOLO_CLUSTER_NAME}-c${i}"
  kubectl config use-context "kind-${cluster_name}"

  install_metrics_server || exit 1

  if [[ "${ENABLE_METALLB}" == "true" ]]; then
    install_metallb || exit 1
    kubectl apply -f "${SCRIPT_PATH}/metallb-cluster-${i}.yaml"
  elif [[ "${ENABLE_KUBE_VIP}" == "true" ]]; then
    install_kube_vip "${cluster_name}" "${kube_vip_addresses[$((i - 1))]}" || exit 1
  else
    echo "Skipping MetalLB install for ${cluster_name}"
  fi

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
  npm run solo -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
  helm list --all-namespaces
done

kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c1"
sleep 10 # give time for solo-setup to finish deploying