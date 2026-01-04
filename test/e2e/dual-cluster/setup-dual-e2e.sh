#!/usr/bin/env bash
set -eo pipefail

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly CLUSTER_DIAGNOSTICS_PATH="${SCRIPT_PATH}/diagnostics/cluster"
readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"
readonly HELM_TIMEOUT="${HELM_TIMEOUT_OVERRIDE:-10m0s}"

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
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ --force-update
helm repo add metallb https://metallb.github.io/metallb --force-update

create_kind_cluster() {
  local cluster_name=$1
  local config_path=$2
  local max_attempts=3
  local attempt=1

  until kind create cluster -n "${cluster_name}" --image "${KIND_IMAGE}" --config "${config_path}"; do
    if [[ ${attempt} -ge ${max_attempts} ]]; then
      echo "ERROR: failed to create Kind cluster ${cluster_name} after ${max_attempts} attempts"
      exit 1
    fi

    echo "Kind cluster ${cluster_name} failed to create (attempt ${attempt}/${max_attempts})." \
      "Retrying in 10 seconds..."
    kind delete cluster -n "${cluster_name}" || true
    sleep 10
    attempt=$((attempt + 1))
  done
}

install_metrics_server() {
  local max_attempts=3
  local attempt=1

  while true; do
    if helm upgrade --install metrics-server metrics-server/metrics-server \
      --namespace kube-system \
      --timeout "${HELM_TIMEOUT}" \
      --set "args[0]=--kubelet-insecure-tls"; then
      return 0
    fi

    if [[ ${attempt} -ge ${max_attempts} ]]; then
      echo "ERROR: failed to install metrics-server after ${max_attempts} attempts" >&2
      return 1
    fi

    echo "metrics-server install failed (attempt ${attempt}/${max_attempts}). Retrying in 10 seconds..."
    helm uninstall metrics-server -n kube-system || true
    sleep 10
    attempt=$((attempt + 1))
  done
}

install_metallb() {
  local max_attempts=3
  local attempt=1

  while true; do
    if helm upgrade --install metallb metallb/metallb \
      --namespace metallb-system --create-namespace --atomic --wait \
      --timeout "${HELM_TIMEOUT}" \
      --set speaker.frr.enabled=true; then
      return 0
    fi

    if [[ ${attempt} -ge ${max_attempts} ]]; then
      echo "ERROR: failed to install metallb after ${max_attempts} attempts" >&2
      kubectl get pods -n metallb-system -o wide || true
      return 1
    fi

    echo "metallb install failed (attempt ${attempt}/${max_attempts}). Retrying in 10 seconds..."
    kubectl get pods -n metallb-system -o wide || true
    helm uninstall metallb -n metallb-system || true
    sleep 10
    attempt=$((attempt + 1))
  done
}

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  cluster_name="${SOLO_CLUSTER_NAME}-c${i}"
  cluster_config="${SCRIPT_PATH}/kind-cluster-${i}.yaml"
  create_kind_cluster "${cluster_name}" "${cluster_config}"

  install_metrics_server || exit 1

  install_metallb || exit 1

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
  npm run solo -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
  helm list --all-namespaces
done

kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c1"
sleep 10 # give time for solo-setup to finish deploying
