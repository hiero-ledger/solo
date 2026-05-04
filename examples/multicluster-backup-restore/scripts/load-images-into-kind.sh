#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <cluster-name-prefix>" >&2
  echo "Example: $0 solo-e2e" >&2
  exit 1
fi

CLUSTER_PREFIX="$1"

# Docker Hub / registry-1 images only (429 mitigation scope).
IMAGES=(
  "busybox"
  "busybox:1.36.1"
  "busybox:stable-musl"
  "docker.io/curlimages/curl:8.9.1"
  "docker.io/envoyproxy/envoy:v1.21.1"
  "docker.io/haproxytech/haproxy-alpine:2.4.25"
  "docker.io/otel/opentelemetry-collector-contrib:0.72.0"
  "postgres:16"
  "registry-1.docker.io/bitnami/postgresql:latest"
)

for idx in 1 2; do
  cluster_name="${CLUSTER_PREFIX}-c${idx}"
  echo "[kind-load] Loading images into ${cluster_name}"
  kind load docker-image "${IMAGES[@]}" -n "$cluster_name"
done

echo "[kind-load] Docker registry images loaded into both clusters."
