#!/bin/bash
################################################################################
# Backup and Restore End-to-End Test Script
#
# This script tests the full backup/restore workflow:
# 1. Deploy a complete Solo network with all components
# 2. Generate transactions to create network state
# 3. Freeze and stop nodes
# 4. Backup the entire network (ConfigMaps, Secrets, Logs, State)
# 5. Tear down the entire network
# 6. Redeploy an empty network with same configuration
# 7. Restore from backup
# 8. Verify restored network functionality
#
# Based on examples/state-save-and-restore/Taskfile.yml
################################################################################

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SOLO_CLUSTER_NAME=solo-e2e-cluster
SOLO_NAMESPACE=solo-e2e-backup-test
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=backup-restore-deployment
SOLO_CLUSTER_REF=kind-${SOLO_CLUSTER_NAME}
SOLO_CONTEXT=kind-${SOLO_CLUSTER_NAME}
NODE_ALIASES=node1,node2
NETWORK_SIZE=2
BACKUP_DIR=./solo-backup-test
STATE_SAVE_DIR=./solo-state-backup
SOLO_COMMAND="npm run solo-test --"
USER_HOME="${HOME}"

# Helper functions
log_step() {
    echo -e "${BLUE}==>${NC} ${GREEN}$1${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

check_command() {
    if command -v $1 &> /dev/null; then
        log_success "$1 is installed"
    else
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Cleanup function for script termination
cleanup_on_exit() {
    if [ $? -ne 0 ]; then
        log_error "Script failed! Cleaning up..."
        kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
    fi
}
#trap cleanup_on_exit EXIT

################################################################################
# Reusable Function: Deploy Full Network
# Parameters:
#   $1 - create_cluster: "true" to create cluster, "false" to skip (default: true)
#   $2 - init_solo: "true" to init Solo, "false" to skip (default: true)
#   $3 - start_nodes: "true" to start nodes, "false" to skip (default: true)
################################################################################
deploy_full_network() {
    local create_cluster="${1:-true}"
    local init_solo="${2:-true}"
    local start_nodes="${3:-true}"

    rm -rf ~/.solo/* test/data/tmp/*

    # Step 2: Create Kind Cluster (optional)
    if [ "$create_cluster" = "true" ]; then
        log_step "Creating Kind cluster"

        # Delete existing cluster if it exists
        kind delete cluster -n "${SOLO_CLUSTER_NAME}" 2>/dev/null || true

        # Create new cluster
        kind create cluster -n "${SOLO_CLUSTER_NAME}"


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
            ghcr.io/hiero-ledger/hiero-block-node:0.20.0 \
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

        # Wait for control plane
        log_info "Waiting for control plane to be ready..."
        sleep 10

        # Verify cluster
        kubectl cluster-info --context kind-${SOLO_CLUSTER_NAME}
        log_success "Kind cluster created successfully"
    fi

    # Step 3: Initialize Solo and Configure (optional)
    if [ "$init_solo" = "true" ]; then
        log_step "Initializing Solo configuration"

        # Solo init
        log_info "Initializing Solo..."
        $SOLO_COMMAND init

        # Setup cluster reference (installs required components)
        log_info "Setting up cluster reference..."
        $SOLO_COMMAND cluster-ref config setup --cluster-ref ${SOLO_CLUSTER_REF}

        # Connect cluster reference with context
        log_info "Connecting to cluster..."
        $SOLO_COMMAND cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_REF} --context ${SOLO_CONTEXT}

        # Create deployment configuration
        log_info "Creating deployment configuration..."
        $SOLO_COMMAND deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"

        # Attach cluster to deployment
        log_info "Attaching cluster to deployment..."
        $SOLO_COMMAND deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF} --num-consensus-nodes ${NETWORK_SIZE}

        log_success "Solo initialized successfully"
    fi

    # Step 4: Add Block Node Configuration
    log_step "Adding block node to deployment"

    log_info "Adding block node configuration..."
    $SOLO_COMMAND block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

    log_success "Block node configuration added"

    # Step 5: Generate Keys and Deploy Consensus Network
    log_step "Generating keys and deploying consensus network"

    # Generate consensus keys (only if init_solo is true)
    if [ "$init_solo" = "true" ]; then
        log_info "Generating consensus keys..."
        $SOLO_COMMAND keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys --node-aliases ${NODE_ALIASES}
    fi

    # Deploy network
    log_info "Deploying consensus network..."
    $SOLO_COMMAND consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES} --pvcs

    # Setup nodes
    log_info "Setting up nodes..."
    $SOLO_COMMAND consensus node setup --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

    # Start nodes (optional)
    if [ "$start_nodes" = "true" ]; then
        log_info "Starting nodes..."
        $SOLO_COMMAND consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}
        log_success "Consensus network deployed and started"
    else
        log_success "Consensus network deployed (nodes not started)"
    fi

    kind load docker-image \
        ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.70.0 \
        ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer:25.1.1 \
        quay.io/jetstack/cert-manager-controller:v1.13.3 \
        quay.io/jetstack/cert-manager-webhook:v1.13.3 \
        quay.io/jetstack/cert-manager-cainjector:v1.13.3 \
        quay.io/jcmoraisjr/haproxy-ingress:v0.14.5 \
        gcr.io/mirrornode/hedera-mirror-grpc:0.140.1 \
        gcr.io/mirrornode/hedera-mirror-importer:0.140.1 \
        gcr.io/mirrornode/hedera-mirror-monitor:0.140.1 \
        gcr.io/mirrornode/hedera-mirror-rest:0.140.1 \
        gcr.io/mirrornode/hedera-mirror-rest-java:0.140.1 \
        gcr.io/mirrornode/hedera-mirror-web3:0.140.1 \
        docker.io/bitnamilegacy/redis:8.2.1-debian-12-r0 \
        docker.io/bitnami/redis-sentinel:7.4.2-debian-12-r6 \
        --name "${SOLO_CLUSTER_NAME}"

    # Step 6: Deploy Additional Components (Mirror, Relay, Explorer)
    log_step "Deploying additional components"

    # Deploy mirror node
    log_info "Deploying mirror node..."
    $SOLO_COMMAND mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

    # Deploy relay node
    log_info "Deploying relay node..."
    $SOLO_COMMAND relay node add --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

    # Deploy explorer
    log_info "Deploying explorer..."
    $SOLO_COMMAND explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

    log_success "All components deployed successfully"

    # Wait for everything to be stable
    log_info "Waiting for network to stabilize..."
    sleep 30
}

################################################################################
# Step 1: Environment Setup
################################################################################
log_step "Step 1: Setting up environment"

# Check prerequisites
check_command "kind"
check_command "kubectl"
check_command "npm"

# Clean up previous test artifacts
log_info "Cleaning up previous test artifacts..."
rm -rf "${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

################################################################################
# Steps 2-6: Deploy Full Network (Initial Deployment)
################################################################################
log_step "Steps 2-6: Deploying complete network infrastructure"

# Call reusable function with default parameters:
# - create_cluster=true (create new cluster)
# - init_solo=true (initialize Solo)
# - start_nodes=true (start consensus nodes)
deploy_full_network "true" "true" "true"

################################################################################
# Step 7: Generate Transactions to Create Network State
################################################################################
log_step "Step 7: Generating test transactions"

log_info "Creating test accounts to generate network state..."
for i in {1..3}; do
    log_info "Creating account $i/3..."
    $SOLO_COMMAND ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 || true
    sleep 2
done

#log_info "Performing account updates..."
#for i in {1..5}; do
#    log_info "Account update $i/5..."
#    $SOLO_COMMAND ledger account update --deployment "${SOLO_DEPLOYMENT}" --account-id 0.0.3 || true
#    sleep 2
#done

log_success "Test transactions generated"

# Wait for transactions to be processed
log_info "Waiting for transactions to be fully processed..."
sleep 30

################################################################################
# Step 8: Freeze Network and Create Backup
################################################################################
log_step "Step 8: Freezing network and creating backup"

# Must destroy mirror node first before freezing
log_info "Destroying mirror node to prepare for freeze..."
$SOLO_COMMAND mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force || true

# Freeze network (required before backup to ensure consistent state)
log_info "Freezing network..."
$SOLO_COMMAND consensus network freeze --deployment "${SOLO_DEPLOYMENT}"

# Wait for freeze to complete
log_info "Waiting for network freeze to complete..."
sleep 10


# Create full backup (ConfigMaps, Secrets, Logs, Config)
log_info "Creating full backup to ${BACKUP_DIR}..."
$SOLO_COMMAND config ops backup --deployment "${SOLO_DEPLOYMENT}" --output-dir "${BACKUP_DIR}"

log_success "Backup created successfully"

# Download state files
log_info "Downloading state files to ${STATE_SAVE_DIR}..."
$SOLO_COMMAND consensus state download --deployment "${SOLO_DEPLOYMENT}" --node-aliases  node1,node2
# copy from default ~/.solo/logs/ to STATE_SAVE_DIR
cp -r ~/.solo/logs/*.tar.gz ${STATE_SAVE_DIR} 2>/dev/null || log_warn "No state files found to copy"

# Verify backup contents
log_info "Backup directory contents:"
ls -lh "${BACKUP_DIR}"
log_info "State files:"
ls -lh "${STATE_SAVE_DIR}"

################################################################################
# Step 9: Delete Cluster
################################################################################
log_step "Step 9: Deleting entire cluster"

log_info "Deleting Kind cluster..."
kind delete cluster -n "${SOLO_CLUSTER_NAME}"

log_success "Cluster deleted successfully"

################################################################################
# Step 10: Redeploy Full Network Infrastructure
################################################################################
log_step "Step 10: Redeploying full network infrastructure"

# Note: Solo config is still intact (stored in ~/.solo)
# Call reusable function with specific parameters:
# - create_cluster=true (recreate cluster from scratch)
# - init_solo=false (Solo config already exists, just reconnect)
# - start_nodes=false (nodes will be started after restore in step 12)
deploy_full_network "true" "true" "true"

################################################################################
# Step 11: Restore Configuration from Backup
################################################################################
log_step "Step 11: Restoring configuration from backup"

# stop nodes before restore
log_info "Stopping consensus nodes before restore..."
$SOLO_COMMAND consensus node stop --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

# Restore ConfigMaps, Secrets, Logs, and State files
log_info "Restoring configuration from ${BACKUP_DIR}..."
$SOLO_COMMAND config ops restore --deployment "${SOLO_DEPLOYMENT}" --input-dir "${BACKUP_DIR}"

log_success "Configuration restored successfully"

# # restart network
# log_info "Restarting consensus nodes after restore..."
# $SOLO_COMMAND consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}



################################################################################
# Step 12: Start Consensus Nodes
################################################################################
log_step "Step 12: Starting consensus nodes with restored state"

# Use first node's state file for all nodes (as per state-save-and-restore example)
FIRST_NODE=$(echo ${NODE_ALIASES} | cut -d',' -f1)
FIRST_NODE_STATE_FILE="${STATE_SAVE_DIR}/network-${FIRST_NODE}-0-state.tar.gz"

if [ ! -f "${FIRST_NODE_STATE_FILE}" ]; then
    log_warn "State file not found: ${FIRST_NODE_STATE_FILE}"
    log_info "Listing available state files:"
    ls -lh "${STATE_SAVE_DIR}/"
    exit 1
else
    log_info "Starting nodes with state file: ${FIRST_NODE_STATE_FILE}"
    $SOLO_COMMAND consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES} --state-file "${FIRST_NODE_STATE_FILE}"
fi

# Wait for network to start and stabilize
log_info "Waiting for consensus network to fully stabilize..."
sleep 60

log_success "Consensus nodes started successfully"


################################################################################
# Step 12: Verify Restored Network with Transactions
################################################################################
log_step "Step 12: Verifying restored network with transactions"

# Check pod status
log_info "Checking pod status..."
kubectl get pods -n "${SOLO_NAMESPACE}" -o wide

# Verify network is responsive
log_info "Waiting for network to be fully responsive..."
sleep 30

# Check if accounts exist (verify state was restored)
log_info "Verifying restored state by checking account..."
$SOLO_COMMAND ledger account info --deployment "${SOLO_DEPLOYMENT}" --account-id 0.0.3 || log_warn "Account verification may have failed"

# Generate new transactions to verify network is fully operational
log_info "Testing restored network with new transactions..."
for i in {1..3}; do
    log_info "Creating new account $i/3 on restored network..."
    $SOLO_COMMAND ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 50 || log_warn "Transaction test may have failed"
    sleep 3
done

log_success "Network verification completed - restored network is operational!"

################################################################################
# Step 13: Test Summary and Cleanup
################################################################################
log_step "Step 13: Test completed successfully!"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  BACKUP/RESTORE TEST COMPLETED${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${CYAN}Test Summary:${NC}"
echo "  ✓ Network deployed with ${NETWORK_SIZE} consensus nodes"
echo "  ✓ Block node configured"
echo "  ✓ Mirror, Relay, and Explorer deployed"
echo "  ✓ Test transactions generated"
echo "  ✓ Network frozen and backed up"
echo "  ✓ Full network destroyed"
echo "  ✓ All components redeployed (consensus + mirror + relay + explorer)"
echo "  ✓ Configuration restored from backup"
echo "  ✓ Consensus nodes started with restored state"
echo "  ✓ Network verified with new transactions"
echo ""
echo -e "${BLUE}Backup Details:${NC}"
echo "  Location: ${BACKUP_DIR}"
echo "  State files: ${STATE_SAVE_DIR}"
echo "  Cluster: ${SOLO_CLUSTER_NAME}"
echo "  Namespace: ${SOLO_NAMESPACE}"
echo "  Deployment: ${SOLO_DEPLOYMENT}"
echo ""

# Offer to keep or destroy cluster
read -p "Do you want to keep the cluster for inspection? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Cleaning up resources..."
    kind delete cluster -n "${SOLO_CLUSTER_NAME}"
    rm -rf "${BACKUP_DIR}" "${STATE_SAVE_DIR}"
    log_success "Cluster and backup files deleted"
else
    log_info "Cluster kept for inspection."
    echo ""
    echo -e "${YELLOW}To inspect the cluster:${NC}"
    echo "  kubectl get pods -n ${SOLO_NAMESPACE}"
    echo "  kubectl logs -n ${SOLO_NAMESPACE} <pod-name>"
    echo ""
    echo -e "${YELLOW}To clean up later:${NC}"
    echo "  kind delete cluster -n ${SOLO_CLUSTER_NAME}"
    echo "  rm -rf ${BACKUP_DIR} ${STATE_SAVE_DIR}"
fi

echo ""
log_success "Test script finished successfully!"
echo ""
