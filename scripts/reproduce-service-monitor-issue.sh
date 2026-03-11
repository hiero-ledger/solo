#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Reproduces the issue: consensus node metrics scraping broken with kube-prometheus-stack
# unless the ServiceMonitor and Services are manually patched.
#
# Issue: https://github.com/hiero-ledger/solo/issues/1891
#
# Prerequisites:
#   - kind (https://kind.sigs.k8s.io/)
#   - kubectl
#   - helm (>= 3.x)
#   - solo CLI (npm install -g @hashgraph/solo, or use 'npm run solo --' in the repo root)
#
# Usage:
#   # Reproduce the issue (patching disabled):
#   PATCH_SERVICE_MONITOR=false bash scripts/reproduce-service-monitor-issue.sh
#
#   # Demonstrate the fix (patching enabled, default):
#   bash scripts/reproduce-service-monitor-issue.sh

set -eo pipefail

SOLO_CMD="${SOLO_CMD:-npm run solo --}"
CLUSTER_NAME="${CLUSTER_NAME:-solo-metrics-test}"
CONTEXT="kind-${CLUSTER_NAME}"
CLUSTER_REFERENCE="${CONTEXT}"
NAMESPACE="${NAMESPACE:-solo-metrics}"
CLUSTER_SETUP_NAMESPACE="${CLUSTER_SETUP_NAMESPACE:-solo-setup}"
DEPLOYMENT="${DEPLOYMENT:-solo-metrics-deployment}"
NODE_ALIASES="node1"

# When set to "false" the ServiceMonitor patch is disabled – this reproduces the original bug.
# The default ("true") exercises the fix introduced by --patch-service-monitor.
PATCH_SERVICE_MONITOR="${PATCH_SERVICE_MONITOR:-true}"

PROMETHEUS_RELEASE="kube-prometheus-stack"
PROMETHEUS_NAMESPACE="${CLUSTER_SETUP_NAMESPACE}"
SERVICE_MONITOR_NAME="solo-service-monitor"

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*" >&2; }
error() { echo "[ERROR] $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" &>/dev/null || error "'$1' is required but not found in PATH"
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
require_cmd kind
require_cmd kubectl
require_cmd helm
require_cmd curl
require_cmd python3

# ---------------------------------------------------------------------------
# Cluster setup
# ---------------------------------------------------------------------------
info "Deleting any existing Kind cluster '${CLUSTER_NAME}'..."
kind delete cluster -n "${CLUSTER_NAME}" 2>/dev/null || true

info "Creating Kind cluster '${CLUSTER_NAME}'..."
kind create cluster -n "${CLUSTER_NAME}"
kubectl config use-context "${CONTEXT}"
sleep 5

# ---------------------------------------------------------------------------
# Solo init & cluster setup with prometheus stack
# ---------------------------------------------------------------------------
info "Initializing Solo..."
$SOLO_CMD init

info "Connecting cluster reference..."
$SOLO_CMD cluster-ref config connect \
  --cluster-ref "${CLUSTER_REFERENCE}" \
  --context "${CONTEXT}"

info "Creating deployment..."
$SOLO_CMD deployment config create \
  --deployment "${DEPLOYMENT}" \
  --namespace "${NAMESPACE}"

info "Attaching cluster to deployment..."
$SOLO_CMD deployment cluster attach \
  --deployment "${DEPLOYMENT}" \
  --cluster-ref "${CLUSTER_REFERENCE}" \
  --num-consensus-nodes 1

info "Setting up cluster with Prometheus stack..."
$SOLO_CMD cluster-ref config setup \
  --cluster-ref "${CLUSTER_REFERENCE}" \
  --cluster-setup-namespace "${CLUSTER_SETUP_NAMESPACE}" \
  --prometheus-stack

info "Generating gossip and TLS keys..."
$SOLO_CMD keys consensus generate \
  --gossip-keys \
  --tls-keys \
  --deployment "${DEPLOYMENT}" \
  --node-aliases "${NODE_ALIASES}"

# ---------------------------------------------------------------------------
# Deploy consensus network with ServiceMonitor enabled
# ---------------------------------------------------------------------------
info "Deploying consensus network (--service-monitor true, --patch-service-monitor ${PATCH_SERVICE_MONITOR})..."
$SOLO_CMD consensus network deploy \
  --deployment "${DEPLOYMENT}" \
  --node-aliases "${NODE_ALIASES}" \
  --service-monitor \
  --patch-service-monitor "${PATCH_SERVICE_MONITOR}"

# ---------------------------------------------------------------------------
# Inspect the ServiceMonitor
# ---------------------------------------------------------------------------
info "Inspecting the ServiceMonitor '${SERVICE_MONITOR_NAME}'..."
SM_JSON=$(kubectl get servicemonitor "${SERVICE_MONITOR_NAME}" \
  -n "${NAMESPACE}" -o json 2>/dev/null) || {
  warn "ServiceMonitor '${SERVICE_MONITOR_NAME}' not found in namespace '${NAMESPACE}'."
  SM_JSON="{}"
}

RELEASE_LABEL=$(echo "${SM_JSON}" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d.get('metadata',{}).get('labels',{}).get('release','<not set>'))")

SM_SELECTOR=$(echo "${SM_JSON}" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d.get('spec',{}).get('selector',{}).get('matchLabels',{}))")

info "ServiceMonitor label 'release' = ${RELEASE_LABEL}"
info "ServiceMonitor spec.selector.matchLabels = ${SM_SELECTOR}"

# ---------------------------------------------------------------------------
# Determine whether Prometheus can discover the ServiceMonitor
# ---------------------------------------------------------------------------
PROMETHEUS_SELECTOR=$(kubectl get prometheus -n "${PROMETHEUS_NAMESPACE}" \
  -o jsonpath='{.items[0].spec.serviceMonitorSelector}' 2>/dev/null || echo "")

info "Prometheus serviceMonitorSelector = ${PROMETHEUS_SELECTOR:-<not found>}"

echo ""
echo "========================================"
if [[ "${RELEASE_LABEL}" == "${PROMETHEUS_RELEASE}" ]]; then
  echo "✅  PASS: ServiceMonitor has the correct 'release: ${PROMETHEUS_RELEASE}' label."
  echo "         Prometheus will discover this ServiceMonitor."
else
  echo "❌  FAIL: ServiceMonitor is missing 'release: ${PROMETHEUS_RELEASE}' label."
  echo "         Prometheus will NOT discover this ServiceMonitor!"
  echo ""
  echo "         This is the original bug. Re-run with PATCH_SERVICE_MONITOR=true to apply the fix:"
  echo "           PATCH_SERVICE_MONITOR=true bash scripts/reproduce-service-monitor-issue.sh"
fi
echo ""

if echo "${SM_SELECTOR}" | grep -q "network-node-svc"; then
  echo "✅  PASS: ServiceMonitor selector targets 'solo.hedera.com/type: network-node-svc'."
else
  echo "❌  FAIL: ServiceMonitor selector does NOT target 'network-node-svc'."
  echo "         Scraping will hit the wrong (or no) services!"
fi
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
# Cleanup (optional – skip by setting KEEP_CLUSTER=true)
# ---------------------------------------------------------------------------
if [[ "${KEEP_CLUSTER:-false}" != "true" ]]; then
  info "Cleaning up: deleting Kind cluster '${CLUSTER_NAME}'..."
  kind delete cluster -n "${CLUSTER_NAME}" 2>/dev/null || true
fi
