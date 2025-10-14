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
# Step 1: Verify Podman installation
# **********************************************************************************************************************
echo "Step 1: Verifying Podman installation..."

if ! command -v podman &> /dev/null; then
    echo "ERROR: Podman not found. Please install Podman first."
    echo "For macOS: brew install podman"
    echo "For Linux: sudo apt-get install -y podman (or equivalent)"
    exit 1
fi

echo "Podman found:"
podman --version

# Configure Podman based on OS
if [[ "$OSTYPE" == "linux-gnu" ]]; then
    echo "Configuring Podman for Linux..."
    
    # On Linux CI (GitHub Actions), configure Podman for rootful mode with special storage settings
    # Check if we're in a CI environment
    if [[ -n "${CI}" || -n "${GITHUB_ACTIONS}" ]]; then
        echo "Running in CI environment, configuring Podman for GitHub Actions"
        
        # Create storage configuration directory
        sudo mkdir -p /etc/containers
        
        # Configure Podman storage to avoid filesystem permission issues
        # Use overlay driver with specific options for CI environment
        sudo tee /etc/containers/storage.conf > /dev/null << 'EOF'
[storage]
driver = "overlay"
runroot = "/run/containers/storage"
graphroot = "/var/lib/containers/storage"

[storage.options]
# Disable user namespace remapping which causes permission issues in CI
mount_program = "/usr/bin/fuse-overlayfs"

[storage.options.overlay]
# Use non-native overlay diff for better compatibility
mountopt = "nodev,metacopy=on"
EOF

        echo "Podman storage configuration created"
        cat /etc/containers/storage.conf
        
        # Start Podman system service (rootful) - ignore systemd errors
        sudo systemctl enable podman.socket 2>/dev/null || true
        sudo systemctl start podman.socket 2>/dev/null || true
        
        # Create a wrapper that runs podman with sudo for Kind
        # Kind expects 'podman' command to work without sudo
        cat > /tmp/podman << 'EOF'
#!/bin/bash
# Run podman with sudo and CI-friendly options
exec sudo /usr/bin/podman --storage-driver overlay "$@"
EOF
        chmod +x /tmp/podman
        
        # Add wrapper to PATH before real podman
        export PATH="/tmp:${PATH}"
        
        # Persist environment variables for GitHub Actions
        if [[ -n "${GITHUB_ENV}" ]]; then
            echo "PATH=/tmp:${PATH}" >> "${GITHUB_ENV}"
            echo "KIND_EXPERIMENTAL_PROVIDER=podman" >> "${GITHUB_ENV}"
        fi
        
        # Verify wrapper works
        echo "Testing Podman wrapper..."
        /tmp/podman --version
        
        # Test image pull with sudo and proper options
        echo "Testing Podman image pull..."
        sudo /usr/bin/podman --storage-driver overlay pull busybox:latest || {
            echo "Warning: Podman image pull test failed"
            echo "This may indicate Podman compatibility issues on this runner"
        }
        
        echo "Podman configured for CI (rootful mode with overlay storage)"
    else
        # On local Linux, try rootless mode
        echo "Setting up rootless Podman"
        systemctl --user enable --now podman.socket || true
        systemctl --user start podman.socket || true
        export DOCKER_HOST=unix://${XDG_RUNTIME_DIR}/podman/podman.sock
        
        podman info | head -n 20
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - requires Podman machine
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
    
    echo "Podman info:"
    podman info | head -n 20
fi

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
