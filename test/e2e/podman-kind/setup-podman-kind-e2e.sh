#!/usr/bin/env bash
set -eo pipefail

##
# Setup script for Podman + Kind E2E Test
# This script creates a single Kind cluster using Podman as the container runtime
#
# Prerequisites:
#   - Podman must be installed (script will verify)
#   - Kind must be available
#   - kubectl and helm must be installed
#
# Usage: ./test/e2e/podman-kind/setup-podman-kind-e2e.sh
##

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

# Create KUBECONFIG path (unique for CI, default for local macOS)
if [[ -n "${GITHUB_RUN_ID}" ]]; then
  # CI environment - use unique config to avoid conflicts
  export KUBECONFIG="${HOME}/.kube/solo-${GITHUB_RUN_ID}.yaml"
  mkdir -p "$(dirname "${KUBECONFIG}")"
  echo "CI Mode: Using unique KUBECONFIG: ${KUBECONFIG}"
  
  # Pre-create file as user to ensure writability
  touch "${KUBECONFIG}"
  chmod 600 "${KUBECONFIG}"
else
  # Local development (macOS) - use default config
  export KUBECONFIG="${HOME}/.kube/config"
  mkdir -p "$(dirname "${KUBECONFIG}")"
  echo "Local Mode: Using default KUBECONFIG: ${KUBECONFIG}"
fi

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin

# Detect OS and set sudo usage accordingly
OS_TYPE="$(uname -s)"
case "${OS_TYPE}" in
  Linux*)
    USE_SUDO="sudo"
    echo "Detected OS: Linux (using rootful mode with sudo)"
    ;;
  Darwin*)
    USE_SUDO=""
    echo "Detected OS: macOS (using rootless mode)"
    ;;
  *)
    echo "Warning: Unknown OS ${OS_TYPE}, attempting without sudo"
    USE_SUDO=""
    ;;
esac

# Determine cluster name
if [[ -n "${SOLO_TEST_CLUSTER}" ]]; then
  SOLO_CLUSTER_NAME="${SOLO_TEST_CLUSTER}"
elif [[ -z "${SOLO_CLUSTER_NAME}" ]]; then
  SOLO_CLUSTER_NAME="solo-e2e"
fi

echo "=========================================="
echo "Podman + Kind E2E Test Setup"
echo "=========================================="
echo "Cluster Name: ${SOLO_CLUSTER_NAME}-c1"
echo "OS: ${OS_TYPE}"
echo "=========================================="

# **********************************************************************************************************************
# Step 2: Configure Kind to use Podman
# **********************************************************************************************************************
echo ""
echo "Step 2: Configuring Kind to use Podman..."
export KIND_EXPERIMENTAL_PROVIDER=podman
echo "KIND_EXPERIMENTAL_PROVIDER set to: ${KIND_EXPERIMENTAL_PROVIDER}"

# **********************************************************************************************************************
# Step 3: Delete existing cluster if present
# **********************************************************************************************************************
echo ""
echo "Step 3: Cleaning up existing cluster..."
${USE_SUDO} kind delete cluster -n "${SOLO_CLUSTER_NAME}-c1" || true

# Clean up Podman network if exists
${USE_SUDO} podman network rm -f kind || true

# **********************************************************************************************************************
# Step 4: Create Podman network for Kind
# **********************************************************************************************************************
echo ""
echo "Step 4: Creating Podman network..."
${USE_SUDO} podman network create kind --subnet 172.19.0.0/16 || true

# **********************************************************************************************************************
# Step 5: Create Kind cluster using Podman
# **********************************************************************************************************************
echo ""
echo "Step 5: Creating Kind cluster with Podman..."
# Reuse standard Kind cluster config (not Podman-specific)
KIND_CONFIG="${SCRIPT_PATH}/../kind-cluster.yaml"
${USE_SUDO} kind create cluster -n "${SOLO_CLUSTER_NAME}-c1" --image "${KIND_IMAGE}" --config "${KIND_CONFIG}" --kubeconfig "${KUBECONFIG}" || exit 1

# Fix ownership after sudo write (Linux only)
if [[ -n "${USE_SUDO}" ]]; then
  ${USE_SUDO} chown $(whoami):$(whoami) "${KUBECONFIG}" || true
fi
chmod 600 "${KUBECONFIG}"

echo "Cluster created successfully"

# List kind clusters
echo "Clusters:"
${USE_SUDO} kind get clusters

# Clean locks
rm -f "${KUBECONFIG}.lock" || true
if [[ -n "${USE_SUDO}" ]]; then
  ${USE_SUDO} rm -f /root/.kube/config.lock || true
fi

# Debug: Show available contexts and raw config
echo "Available kubectl contexts:"
kubectl config get-contexts
echo "Raw kubeconfig contents:"
cat "${KUBECONFIG}"

# Reliable detection: Use kubectl to list context names and grep for pattern
KIND_CONTEXT=$(kubectl config get-contexts -o name | grep -E "(kind-)?${SOLO_CLUSTER_NAME}-c1$" | head -1)
if [[ -z "${KIND_CONTEXT}" ]]; then
  echo "Error: No matching context found for pattern ${SOLO_CLUSTER_NAME}-c1. Available:"
  kubectl config get-contexts -o name
  exit 1
else
  echo "Detected context: ${KIND_CONTEXT}"
fi

# Verify (redundant but safe)
if ! kubectl config get-contexts -o name | grep -q "^${KIND_CONTEXT}$"; then
  echo "Error: Verified context ${KIND_CONTEXT} missing."
  exit 1
fi

# **********************************************************************************************************************
# Step 6: Build and Initialize Solo
# **********************************************************************************************************************
echo ""
echo "Step 6: Building Solo and initializing..."

SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
task build

echo "Switching to kubectl context: ${KIND_CONTEXT}"
kubectl config use-context "${KIND_CONTEXT}"

# Setup cluster reference
npm run solo -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1

# **********************************************************************************************************************
# Step 7: Verify setup
# **********************************************************************************************************************
echo ""
echo "Step 7: Verifying setup..."

echo "Helm releases:"
helm list --all-namespaces

echo ""
echo "Cluster info:"
kubectl cluster-info

echo ""
echo "Nodes:"
kubectl get nodes -o wide

echo ""
echo "Namespaces:"
kubectl get namespaces

# Give time for solo-setup to finish deploying
echo ""
echo "Waiting for setup to stabilize..."
sleep 10

echo ""
echo "=========================================="
echo "✅ Podman + Kind E2E Test Setup Complete!"
echo "=========================================="
echo "Cluster: ${SOLO_CLUSTER_NAME}-c1"
echo "Context: ${KIND_CONTEXT}"
echo "Container Runtime: Podman"
echo "KUBECONFIG: ${KUBECONFIG}"
echo ""
if [[ -n "${GITHUB_RUN_ID}" ]]; then
  echo "CI: KUBECONFIG exported for workflow"
else
  echo "Local: Using default kubeconfig - no extra setup needed!"
fi
echo ""
echo "Run the E2E test:"
echo "  SOLO_TEST_CLUSTER=${SOLO_CLUSTER_NAME}-c1 task test-e2e-node-local-ptt"
echo "=========================================="
