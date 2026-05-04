#!/usr/bin/env bash

set -euo pipefail

pull_with_retry() {
  local image="$1"
  local attempts=5
  local delay=5
  local i=1

  while (( i <= attempts )); do
    if docker pull "$image"; then
      echo "[prepull] Pulled: $image"
      return 0
    fi

    echo "[prepull] Pull failed ($i/$attempts): $image" >&2
    if (( i == attempts )); then
      return 1
    fi
    sleep "$delay"
    i=$((i + 1))
  done
}

# Docker Hub / registry-1 images only (429 mitigation scope).
IMAGES=(
  "busybox"
  "busybox:1.36.1"
  "busybox:stable-musl"
  "docker.io/curlimages/curl:8.9.1"
  "docker.io/envoyproxy/envoy:v1.21.1"
  "docker.io/haproxytech/haproxy-alpine:2.4.25"
  "docker.io/otel/opentelemetry-collector-contrib:0.72.0"
  "kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"
  "postgres:16"
  "registry-1.docker.io/bitnami/postgresql:latest"
)

for image in "${IMAGES[@]}"; do
  pull_with_retry "$image"
done

echo "[prepull] Docker registry image warmup completed."
