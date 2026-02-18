#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${HOME}/.solo/local-config.yaml"
REQUESTED="${1:-}"

if [ ! -f "${CONFIG_FILE}" ]; then
  echo "ERROR: local config not found: ${CONFIG_FILE}" >&2
  exit 1
fi

extract_deployments() {
  awk '
    /^[[:space:]]*deployments:[[:space:]]*$/ {in_deployments=1; next}
    /^[[:space:]]*userIdentity:[[:space:]]*$/ {in_deployments=0}
    in_deployments && /^[[:space:]]*name:[[:space:]]*/ {print $2}
  ' "${CONFIG_FILE}"
}

if [ -n "${REQUESTED}" ] && extract_deployments | grep -qx "${REQUESTED}"; then
  echo "${REQUESTED}"
  exit 0
fi

LATEST_DEPLOYMENT="$(extract_deployments | tail -n 1)"
if [ -z "${LATEST_DEPLOYMENT}" ]; then
  echo "ERROR: No deployments found in ${CONFIG_FILE}" >&2
  exit 1
fi

echo "${LATEST_DEPLOYMENT}"
