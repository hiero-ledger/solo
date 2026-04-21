#!/bin/bash
set -eo pipefail

#
# Install metrics-server on the current kubectl context and wait until serving.
# Safe to call multiple times (uses helm upgrade --install).
# Usage: ./install-metrics-server.sh
#

export PATH=~/.solo/bin:${PATH}

helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ \
  --force-update 2>/dev/null || true

helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --set "args[0]=--kubelet-insecure-tls" \
  --wait --timeout 120s

# --wait guarantees the pod is Running, but metrics-server needs another 30-60s
# to collect its first round of node/pod metrics before kubectl top works.
echo "Waiting for metrics-server to start serving metrics..."
for i in $(seq 1 24); do
  if kubectl top nodes >/dev/null 2>&1; then
    echo "Metrics-server ready after ${i} probe(s) (~$((i * 5))s)"
    exit 0
  fi
  sleep 5
done
echo "Warning: metrics-server did not become ready within 2 minutes, continuing anyway"
