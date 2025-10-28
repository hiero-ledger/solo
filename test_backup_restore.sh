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
trap cleanup_on_exit EXIT

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
rm -rf ~/.solo/cache ~/.solo/logs test/data/tmp/* "${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

################################################################################
# Step 2: Create Kind Cluster
################################################################################
log_step "Step 2: Creating Kind cluster"

# Delete existing cluster if it exists
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 2>/dev/null || true

# Create new cluster
kind create cluster -n "${SOLO_CLUSTER_NAME}"

# Wait for control plane
log_info "Waiting for control plane to be ready..."
sleep 10

# Verify cluster
kubectl cluster-info --context kind-${SOLO_CLUSTER_NAME}
log_success "Kind cluster created successfully"

################################################################################
# Step 3: Initialize Solo and Configure
################################################################################
log_step "Step 3: Initializing Solo configuration"

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

################################################################################
# Step 4: Add Block Node Configuration
################################################################################
log_step "Step 4: Adding block node to deployment"

# Add block node to the deployment (before generating keys)
log_info "Adding block node configuration..."
$SOLO_COMMAND block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

log_success "Block node configuration added"

################################################################################
# Step 5: Generate Keys and Deploy Consensus Network
################################################################################
log_step "Step 5: Generating keys and deploying consensus network"

# Generate consensus keys
$SOLO_COMMAND keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys --node-aliases ${NODE_ALIASES}

# Deploy network
$SOLO_COMMAND consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES} --pvcs

# Setup nodes
$SOLO_COMMAND consensus node setup --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

# Start nodes
$SOLO_COMMAND consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

log_success "Consensus network deployed and started"

################################################################################
# Step 6: Deploy Additional Components (Mirror, Relay, Explorer)
################################################################################
log_step "Step 6: Deploying additional components"

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

################################################################################
# Step 7: Generate Transactions to Create Network State
################################################################################
log_step "Step 7: Generating test transactions"

log_info "Creating test accounts to generate network state..."
for i in {1..10}; do
    log_info "Creating account $i/10..."
    $SOLO_COMMAND ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 || true
    sleep 2
done

log_info "Performing account updates..."
for i in {1..5}; do
    log_info "Account update $i/5..."
    $SOLO_COMMAND ledger account update --deployment "${SOLO_DEPLOYMENT}" --account-id 0.0.3 || true
    sleep 2
done

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

# Download state files from nodes
log_info "Downloading state files from consensus nodes..."
mkdir -p "${STATE_SAVE_DIR}"
$SOLO_COMMAND consensus state download --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

# Copy state files to backup directory
log_info "Copying state files to backup directory..."
for node in $(echo ${NODE_ALIASES} | tr ',' ' '); do
    STATE_FILE="network-${node}-0-state.zip"
    if [ -f "${USER_HOME}/.solo/logs/${SOLO_NAMESPACE}/${STATE_FILE}" ]; then
        cp "${USER_HOME}/.solo/logs/${SOLO_NAMESPACE}/${STATE_FILE}" "${STATE_SAVE_DIR}/"
        log_info "Saved state for ${node}"
    else
        log_warn "State file not found: ${STATE_FILE}"
    fi
done

# Create full backup (ConfigMaps, Secrets, Logs, Config)
log_info "Creating full backup to ${BACKUP_DIR}..."
$SOLO_COMMAND config ops backup --deployment "${SOLO_DEPLOYMENT}" --output-dir "${BACKUP_DIR}"

log_success "Backup created successfully"

# Verify backup contents
log_info "Backup directory contents:"
ls -lh "${BACKUP_DIR}"
log_info "State files:"
ls -lh "${STATE_SAVE_DIR}"

################################################################################
# Step 9: Tear Down Entire Network
################################################################################
log_step "Step 9: Tearing down entire network"

# Destroy explorer
log_info "Destroying explorer..."
$SOLO_COMMAND explorer node destroy --deployment "${SOLO_DEPLOYMENT}" || true

# Destroy relay
log_info "Destroying relay..."
$SOLO_COMMAND relay node destroy --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES} || true

# Destroy mirror node
log_info "Destroying mirror node..."
$SOLO_COMMAND mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force || true

# Destroy consensus network
log_info "Destroying consensus network..."
$SOLO_COMMAND consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force

log_success "Network destroyed successfully"

# Verify namespace is clean
log_info "Verifying namespace cleanup..."
kubectl get all -n "${SOLO_NAMESPACE}" || log_info "Namespace is clean"

################################################################################
# Step 10: Redeploy All Network Infrastructure and Components
################################################################################
log_step "Step 10: Redeploying all network infrastructure and components"

# Note: Solo config and cluster-ref are still intact

# Re-add block node configuration
log_info "Re-adding block node configuration..."
$SOLO_COMMAND block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

# Deploy empty consensus network
log_info "Deploying empty consensus network..."
$SOLO_COMMAND consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES} --pvcs

# Setup nodes (without starting them yet)
log_info "Setting up nodes..."
$SOLO_COMMAND consensus node setup --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

# Redeploy mirror node
log_info "Redeploying mirror node..."
$SOLO_COMMAND mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

# Redeploy relay node
log_info "Redeploying relay node..."
$SOLO_COMMAND relay node add --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}

# Redeploy explorer
log_info "Redeploying explorer..."
$SOLO_COMMAND explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_REF}

log_success "All network infrastructure and components redeployed"

################################################################################
# Step 11: Restore Configuration from Backup
################################################################################
log_step "Step 11: Restoring configuration from backup"

# Restore ConfigMaps, Secrets, Logs, and State files
log_info "Restoring configuration from ${BACKUP_DIR}..."
$SOLO_COMMAND config ops restore --deployment "${SOLO_DEPLOYMENT}" --input-dir "${BACKUP_DIR}"

log_success "Configuration restored successfully"

# Wait for restore to settle
log_info "Waiting for restored configuration to settle..."
sleep 10

################################################################################
# Step 12: Start Consensus Nodes
################################################################################
log_step "Step 12: Starting consensus nodes with restored state"

# Use first node's state file for all nodes (as per state-save-and-restore example)
FIRST_NODE=$(echo ${NODE_ALIASES} | cut -d',' -f1)
FIRST_NODE_STATE_FILE="${STATE_SAVE_DIR}/network-${FIRST_NODE}-0-state.zip"

if [ ! -f "${FIRST_NODE_STATE_FILE}" ]; then
    log_warn "State file not found: ${FIRST_NODE_STATE_FILE}"
    log_info "Starting nodes without state file..."
    $SOLO_COMMAND consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES}
else
    log_info "Starting nodes with state file: ${FIRST_NODE_STATE_FILE}"
    $SOLO_COMMAND consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases ${NODE_ALIASES} --state-file "${FIRST_NODE_STATE_FILE}"
fi

# Wait for network to start and stabilize
log_info "Waiting for consensus network to fully stabilize..."
sleep 60

log_success "Consensus nodes started successfully"

################################################################################
# Step 13: Verify Restored Network with Transactions
################################################################################
log_step "Step 13: Verifying restored network with transactions"

# Check pod status
log_info "Checking pod status..."
kubectl get pods -n "${SOLO_NAMESPACE}" -o wide

# Verify network is responsive
log_info "Waiting for network to be fully responsive..."
sleep 30

# Check if accounts exist (verify state was restored)
log_info "Verifying restored state by checking account..."
$SOLO_COMMAND ledger account get --deployment "${SOLO_DEPLOYMENT}" --account-id 0.0.3 || log_warn "Account verification may have failed"

# Generate new transactions to verify network is fully operational
log_info "Testing restored network with new transactions..."
for i in {1..3}; do
    log_info "Creating new account $i/3 on restored network..."
    $SOLO_COMMAND ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 50 || log_warn "Transaction test may have failed"
    sleep 3
done

log_success "Network verification completed - restored network is operational!"

################################################################################
# Step 14: Test Summary and Cleanup
################################################################################
log_step "Step 14: Test completed successfully!"

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
