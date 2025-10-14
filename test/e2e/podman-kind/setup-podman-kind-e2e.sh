#!/usr/bin/env bash
set -eo pipefail

##
# Setup script for Podman + Kind E2E Test
# This script creates a single Kind cluster using Podman as the container runtime
# Usage: ./test/e2e/podman-kind/setup-podman-kind-e2e.sh
##

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin

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
echo "=========================================="

# **********************************************************************************************************************
# Step 1: Install Podman (if not already installed)
# **********************************************************************************************************************
echo "Step 1: Checking Podman installation..."

if ! command -v podman &> /dev/null; then
    echo "Podman not found. Installing Podman..."
    
    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            # Debian/Ubuntu
            sudo apt-get update
            sudo apt-get install -y podman
        elif command -v yum &> /dev/null; then
            # RHEL/CentOS
            sudo yum install -y podman
        else
            echo "ERROR: Unsupported Linux distribution"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install podman
        else
            echo "ERROR: Homebrew not found. Please install Homebrew first."
            exit 1
        fi
    else
        echo "ERROR: Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    echo "Podman installed successfully"
else
    echo "Podman already installed"
fi

podman --version

# Start Podman socket (required for API access)
if [[ "$OSTYPE" == "linux-gnu" ]]; then
    systemctl --user start podman.socket || true
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # Check if podman machine exists
    if podman machine list | grep -q "podman-machine-default"; then
        echo "Podman machine exists, checking resources..."
        
        # Check current memory (should be at least 6GB for K8s)
        CURRENT_MEMORY=$(podman machine list --format "{{.Memory}}" | head -1)
        echo "Current memory: ${CURRENT_MEMORY}"
        
        # Recommend at least 8GB for Kubernetes
        echo "Note: Kubernetes clusters require at least 6-8GB memory"
        echo "If you experience CrashLoopBackOff errors, increase memory with:"
        echo "  podman machine stop"
        echo "  podman machine set --memory 8192 --cpus 4 podman-machine-default"
        echo "  podman machine start"
        
        # Start machine if not running
        podman machine start || true
    else
        echo "Creating new Podman machine with 8GB RAM and 4 CPUs..."
        podman machine init --cpus 4 --memory 8192 --disk-size 100 podman-machine-default
        podman machine start
    fi
fi

echo "Podman info:"
podman info | head -n 20

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
kind delete cluster -n "${SOLO_CLUSTER_NAME}-c1" || true

# Clean up Podman network if exists
podman network rm -f kind || true

# **********************************************************************************************************************
# Step 4: Create Podman network for Kind
# **********************************************************************************************************************
echo ""
echo "Step 4: Creating Podman network..."
podman network create kind --subnet 172.19.0.0/16 || true

# **********************************************************************************************************************
# Step 5: Create Kind cluster using Podman
# **********************************************************************************************************************
echo ""
echo "Step 5: Creating Kind cluster with Podman..."
kind create cluster -n "${SOLO_CLUSTER_NAME}-c1" --image "${KIND_IMAGE}" --config "${SCRIPT_PATH}/kind-cluster.yaml" || exit 1

echo "Cluster created successfully"
kind get clusters

# **********************************************************************************************************************
# Step 6: Build and Initialize Solo
# **********************************************************************************************************************
echo ""
echo "Step 6: Building Solo and initializing..."

SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
task build
npm run solo -- init || exit 1 # cache args for subsequent commands

# Switch to the cluster context
kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c1"

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
echo "Context: kind-${SOLO_CLUSTER_NAME}-c1"
echo "Container Runtime: Podman"
echo ""
echo "Next step: Run the E2E test with:"
echo "  SOLO_TEST_CLUSTER=${SOLO_CLUSTER_NAME}-c1 task test-e2e-podman-kind-cluster"
echo "=========================================="
