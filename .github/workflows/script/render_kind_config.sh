#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <input-kind-config.yaml> <output-kind-config.yaml>" >&2
  exit 1
fi

input_config="$1"
output_config="$2"

if [[ ! -f "${input_config}" ]]; then
  echo "Input kind config not found: ${input_config}" >&2
  exit 1
fi

fallback_registry="${KIND_DOCKER_REGISTRY_PRIMARY:-registry-1.docker.io}"
mirror_registries="${KIND_DOCKER_REGISTRY_MIRRORS:-}"

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

endpoint_list=()
fallback_endpoint="$(normalize_endpoint "${fallback_registry}")"

if [[ -n "${mirror_registries}" ]]; then
  IFS=',' read -r -a mirrors <<< "${mirror_registries}"
  for mirror in "${mirrors[@]}"; do
    endpoint="$(normalize_endpoint "${mirror}" || true)"
    if [[ -z "${endpoint}" ]]; then
      continue
    fi
    if [[ "${endpoint}" == "${fallback_endpoint}" ]]; then
      continue
    fi
    endpoint_list+=("${endpoint}")
  done
fi

# Keep docker hub (or configured primary) as the last fallback endpoint.
endpoint_list+=("${fallback_endpoint}")

containerd_endpoint_value=""
for endpoint in "${endpoint_list[@]}"; do
  if [[ -n "${containerd_endpoint_value}" ]]; then
    containerd_endpoint_value+=", "
  fi
  containerd_endpoint_value+="\"${endpoint}\""
done

echo "Rendering kind config: ${input_config} -> ${output_config}"
echo "Using containerd registry endpoints: [${containerd_endpoint_value}]"

sed -E "s|endpoint = \[[^]]*\]|endpoint = [${containerd_endpoint_value}]|g" "${input_config}" > "${output_config}"
