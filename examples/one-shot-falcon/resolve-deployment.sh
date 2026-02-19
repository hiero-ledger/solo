#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${HOME}/.solo/local-config.yaml"
REQUESTED="${1:-}"
OUTPUT_FIELD="${2:-deployment}"

if [ ! -f "${CONFIG_FILE}" ]; then
  echo "ERROR: local config not found: ${CONFIG_FILE}" >&2
  exit 1
fi

# Extract "name|namespace" pairs from the local config YAML.
extract_deployment_pairs() {
  awk '
    /^[[:space:]]*deployments:[[:space:]]*$/ {in_deployments=1; next}
    /^[[:space:]]*userIdentity:[[:space:]]*$/ {in_deployments=0}
    in_deployments && /^[[:space:]]*name:[[:space:]]*/ {
      current_name=$2;
      next
    }
    in_deployments && /^[[:space:]]*namespace:[[:space:]]*/ {
      if (current_name != "") {
        print current_name "|" $2;
        current_name=""
      }
    }
  ' "${CONFIG_FILE}"
}

extract_deployments() {
  extract_deployment_pairs | cut -d'|' -f1
}

extract_namespace_by_deployment() {
  local deployment_name="${1}"
  extract_deployment_pairs | awk -F'|' -v name="${deployment_name}" '$1 == name {print $2; exit}'
}

if [[ "${OUTPUT_FIELD}" != "deployment" && "${OUTPUT_FIELD}" != "namespace" ]]; then
  echo "ERROR: Unsupported output field '${OUTPUT_FIELD}'. Use 'deployment' or 'namespace'." >&2
  exit 1
fi

LATEST_PAIR="$(extract_deployment_pairs | tail -n 1)"
if [ -z "${LATEST_PAIR}" ]; then
  echo "ERROR: No deployments found in ${CONFIG_FILE}" >&2
  exit 1
fi

LATEST_DEPLOYMENT="$(echo "${LATEST_PAIR}" | cut -d'|' -f1)"
LATEST_NAMESPACE="$(echo "${LATEST_PAIR}" | cut -d'|' -f2)"

RESOLVED_DEPLOYMENT="${LATEST_DEPLOYMENT}"
if [ -n "${REQUESTED}" ] && extract_deployments | grep -qx "${REQUESTED}"; then
  RESOLVED_DEPLOYMENT="${REQUESTED}"
fi

if [ "${OUTPUT_FIELD}" = "deployment" ]; then
  echo "${RESOLVED_DEPLOYMENT}"
  exit 0
fi

RESOLVED_NAMESPACE="$(extract_namespace_by_deployment "${RESOLVED_DEPLOYMENT}")"
if [ -z "${RESOLVED_NAMESPACE}" ]; then
  RESOLVED_NAMESPACE="${LATEST_NAMESPACE}"
fi

if [ -z "${RESOLVED_NAMESPACE}" ]; then
  echo "ERROR: Namespace not found for deployment ${RESOLVED_DEPLOYMENT}" >&2
  exit 1
fi

echo "${RESOLVED_NAMESPACE}"
