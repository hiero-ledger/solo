#!/usr/bin/env bash
# collect_deployed_images.sh
#
# Collects all Docker images used by live Helm charts in the current
# kubectl context and writes them to an output directory.
#
# Usage:
#   ./collect_deployed_images.sh [OUTPUT_DIR]
#
# Arguments:
#   OUTPUT_DIR  Directory to write report files (default: ~/.solo/image-report)
#
# Works on Linux and macOS. On Windows, run inside Git Bash or WSL.
#
# Prerequisites: kubectl, helm, jq, awk, grep, sed, sort, wc
#
# Output files:
#   deployed-images.txt    Unique images from live pods (sorted)
#   helm-chart-images.txt  Unique images from Helm chart manifests (sorted)
#   all-images.txt         Combined deduplicated list
#
set -euo pipefail

OUTPUT_DIR="${1:-${HOME}/.solo/image-report}"
mkdir -p "${OUTPUT_DIR}"

IMAGE_FILE="${OUTPUT_DIR}/deployed-images.txt"
HELM_IMAGE_FILE="${OUTPUT_DIR}/helm-chart-images.txt"
COMBINED_FILE="${OUTPUT_DIR}/all-images.txt"

# Use a temp dir that works on both Linux/macOS and Git Bash on Windows
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "================================================================"
echo "  Images from live pods (all namespaces)"
echo "================================================================"

kubectl get pods -A -o json \
  | jq -r '
      .items[] |
      .metadata.namespace as $ns |
      .metadata.name as $pod |
      ((.spec.containers // []) + (.spec.initContainers // [])) [] |
      [$ns, $pod, .name, .image] | @tsv
    ' \
  | sort -u \
  | tee "${TMP_DIR}/pod-images-raw.txt"

echo ""
echo "================================================================"
echo "  Unique image references (sorted)"
echo "================================================================"

awk -F'\t' '{print $4}' "${TMP_DIR}/pod-images-raw.txt" | sort -u | tee "${IMAGE_FILE}"

echo ""
echo "================================================================"
echo "  Helm releases and their chart images"
echo "================================================================"

helm list -A -o json \
  | jq -r '.[] | .name + "\t" + .namespace' \
  | while IFS=$'\t' read -r release ns; do
      echo "--- Release: ${release} (namespace: ${ns}) ---"
      helm get manifest "${release}" -n "${ns}" 2>/dev/null \
        | grep -E '^\s+image:' \
        | sed 's/.*image:[[:space:]]*//' \
        | tr -d '"' \
        | sort -u
    done \
  | tee "${TMP_DIR}/helm-images-raw.txt"

grep -v '^---' "${TMP_DIR}/helm-images-raw.txt" | sort -u > "${HELM_IMAGE_FILE}" || true

echo ""
echo "================================================================"
echo "  Combined unique images (pods + helm manifests)"
echo "================================================================"

cat "${IMAGE_FILE}" "${HELM_IMAGE_FILE}" | sort -u | tee "${COMBINED_FILE}"

TOTAL=$(wc -l < "${COMBINED_FILE}" | tr -d ' ')
echo ""
echo "Total unique images: ${TOTAL}"
echo "Report saved to: ${OUTPUT_DIR}"
