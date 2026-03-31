#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------------------
# render_kind_config.sh
#
# Purpose:
#   Render a kind config file with containerd registry mirror endpoints sourced
#   from environment variables, instead of hardcoding mirrors in YAML.
#
# Usage:
#   ./render_kind_config.sh <input-kind-config.yaml> <output-kind-config.yaml>
#
# Environment variables:
#   KIND_DOCKER_REGISTRY_MIRRORS
#     Optional comma-separated list of preferred mirror registries.
#     Examples:
#       hub.mirror.docker.lat.ope.eng.hashgraph.io,mirror.gcr.io
#       https://hub.mirror.docker.lat.ope.eng.hashgraph.io,https://mirror.gcr.io
#
# Behavior:
#   1) Parse mirrors from KIND_DOCKER_REGISTRY_MIRRORS (if present).
#   2) Normalize endpoints (trim, add https:// when missing).
#   3) De-duplicate Docker Hub fallback if it also appears in mirrors.
#   4) Append Docker Hub (registry-1.docker.io) as the final fallback endpoint.
#   5) Replace all `endpoint = [...]` values in the input config and write output.
# ------------------------------------------------------------------------------

# Basic argument validation.
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <input-kind-config.yaml> <output-kind-config.yaml>" >&2
  exit 1
fi

input_config="$1"
output_config="$2"

# Ensure the source config exists before rendering.
if [[ ! -f "${input_config}" ]]; then
  echo "Input kind config not found: ${input_config}" >&2
  exit 1
fi

# Docker Hub fallback is intentionally fixed and always last.
fallback_registry="registry-1.docker.io"
# Mirrors are optional; empty means "fallback only".
mirror_registries="${KIND_DOCKER_REGISTRY_MIRRORS:-}"

# Normalize a registry host/url into a valid endpoint:
# - Trim whitespace
# - Return non-zero for empty input
# - Add https:// scheme when only a host is provided
normalize_endpoint() {
  local registry="$1"
  registry="${registry#"${registry%%[![:space:]]*}"}"
  registry="${registry%"${registry##*[![:space:]]}"}"
  if [[ -z "${registry}" ]]; then
    return 1
  fi

  if [[ "${registry}" == http://* || "${registry}" == https://* ]]; then
    printf '%s\n' "${registry}"
  else
    printf 'https://%s\n' "${registry}"
  fi
}

# Build ordered endpoint list:
# - mirrors first (if provided)
# - fallback endpoint last
endpoint_list=()
fallback_endpoint="$(normalize_endpoint "${fallback_registry}")"

# Parse comma-separated mirrors from env var and normalize each item.
if [[ -n "${mirror_registries}" ]]; then
  IFS=',' read -r -a mirrors <<< "${mirror_registries}"
  for mirror in "${mirrors[@]}"; do
    # Do not fail on a single bad mirror entry; skip invalid/empty values.
    endpoint="$(normalize_endpoint "${mirror}" || true)"
    if [[ -z "${endpoint}" ]]; then
      continue
    fi
    # Avoid duplicate fallback if user lists it in mirrors.
    if [[ "${endpoint}" == "${fallback_endpoint}" ]]; then
      continue
    fi
    endpoint_list+=("${endpoint}")
  done
fi

# Keep docker hub (or configured primary) as the last fallback endpoint.
endpoint_list+=("${fallback_endpoint}")

# Convert bash array to TOML array string:
#   ["https://a", "https://b", ...]
containerd_endpoint_value=""
for endpoint in "${endpoint_list[@]}"; do
  if [[ -n "${containerd_endpoint_value}" ]]; then
    containerd_endpoint_value+=", "
  fi
  containerd_endpoint_value+="\"${endpoint}\""
done

echo "Rendering kind config: ${input_config} -> ${output_config}"
echo "Using containerd registry endpoints: [${containerd_endpoint_value}]"

# Replace any existing endpoint arrays under containerd mirror blocks.
# This intentionally updates all matching `endpoint = [...]` lines.
sed -E "s|endpoint = \[[^]]*\]|endpoint = [${containerd_endpoint_value}]|g" "${input_config}" > "${output_config}"

echo "Rendered kind config content:"
cat "${output_config}"
