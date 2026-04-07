#!/usr/bin/env bash
set -euo pipefail

# Local diagnostic helper to mimic CI image pulls from inside kind node containerd.
# It tests canonical docker.io pulls under different kind registry mirror configs,
# plus direct pulls from mirror and Docker Hub endpoints.

IMAGE_REPO_TAG="${IMAGE_REPO_TAG:-library/maven:3-eclipse-temurin-25-alpine}"
MIRROR_REGISTRY="${MIRROR_REGISTRY:-hub.mirror.docker.lat.ope.eng.hashgraph.io}"
DOCKERHUB_REGISTRY="${DOCKERHUB_REGISTRY:-registry-1.docker.io}"
ATTEMPTS="${ATTEMPTS:-3}"
CLUSTER_PREFIX="${CLUSTER_PREFIX:-pull-probe}"
KEEP_CLUSTERS="${KEEP_CLUSTERS:-0}"
CLEANUP_WORK_DIR="${CLEANUP_WORK_DIR:-0}"

IMAGE_CANONICAL="docker.io/${IMAGE_REPO_TAG}"
IMAGE_MIRROR="${MIRROR_REGISTRY}/${IMAGE_REPO_TAG}"
IMAGE_DOCKERHUB="${DOCKERHUB_REGISTRY}/${IMAGE_REPO_TAG}"

if ! command -v kind >/dev/null 2>&1; then
  echo "kind is required"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required"
  exit 1
fi
if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required"
  exit 1
fi

WORK_DIR="$(mktemp -d)"
RESULTS_FILE="${WORK_DIR}/results.tsv"
if [ "${CLEANUP_WORK_DIR}" = "1" ]; then
  trap 'rm -rf "${WORK_DIR}"' EXIT
fi

echo -e "mode\tattempt\ttest\tstatus\tcluster\tlog_file" > "${RESULTS_FILE}"

write_kind_config() {
  local mode="$1"
  local file="$2"
  local endpoint_list=""
  case "${mode}" in
    mirror_only)
      endpoint_list="\"https://${MIRROR_REGISTRY}\""
      ;;
    hub_only)
      endpoint_list="\"https://${DOCKERHUB_REGISTRY}\""
      ;;
    fallback)
      endpoint_list="\"https://${MIRROR_REGISTRY}\", \"https://${DOCKERHUB_REGISTRY}\""
      ;;
    *)
      echo "Unknown mode: ${mode}"
      exit 1
      ;;
  esac

  cat > "${file}" <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
      endpoint = [${endpoint_list}]
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."registry-1.docker.io"]
      endpoint = [${endpoint_list}]
nodes:
  - role: control-plane
EOF
}

record_result() {
  local mode="$1"
  local attempt="$2"
  local test_name="$3"
  local status="$4"
  local cluster="$5"
  local log_file="$6"
  echo -e "${mode}\t${attempt}\t${test_name}\t${status}\t${cluster}\t${log_file}" >> "${RESULTS_FILE}"
}

run_pull_test() {
  local mode="$1"
  local attempt="$2"
  local cluster="$3"
  local node="$4"
  local test_name="$5"
  local image="$6"

  local log_file="${WORK_DIR}/${cluster}-${test_name}.log"
  docker exec "${node}" ctr --namespace=k8s.io images rm "${image}" >/dev/null 2>&1 || true

  if docker exec "${node}" ctr --namespace=k8s.io images pull "${image}" >"${log_file}" 2>&1; then
    echo "[PASS] ${mode} attempt ${attempt} ${test_name}: ${image}"
    record_result "${mode}" "${attempt}" "${test_name}" "PASS" "${cluster}" "${log_file}"
  else
    echo "[FAIL] ${mode} attempt ${attempt} ${test_name}: ${image}"
    echo "  key errors:"
    rg -n "unexpected EOF|failed to pull|ErrImagePull|ImagePullBackOff|timeout|TLS|x509|connection reset|no such host|denied|unauthorized" "${log_file}" || tail -n 25 "${log_file}"
    record_result "${mode}" "${attempt}" "${test_name}" "FAIL" "${cluster}" "${log_file}"
  fi
}

MODES=(mirror_only hub_only fallback)

echo "IMAGE_CANONICAL=${IMAGE_CANONICAL}"
echo "IMAGE_MIRROR=${IMAGE_MIRROR}"
echo "IMAGE_DOCKERHUB=${IMAGE_DOCKERHUB}"
echo "ATTEMPTS=${ATTEMPTS}"
echo "WORK_DIR=${WORK_DIR}"

for mode in "${MODES[@]}"; do
  config_file="${WORK_DIR}/kind-${mode}.yaml"
  write_kind_config "${mode}" "${config_file}"

  for attempt in $(seq 1 "${ATTEMPTS}"); do
    cluster_mode="${mode//_/-}"
    cluster="${CLUSTER_PREFIX}-${cluster_mode}-${attempt}"
    echo
    echo "=== ${mode} / attempt ${attempt} / cluster ${cluster} ==="

    kind delete cluster --name "${cluster}" >/dev/null 2>&1 || true
    kind create cluster --name "${cluster}" --config "${config_file}" >/dev/null

    node="$(kind get nodes --name "${cluster}" | head -n 1)"
    if [ -z "${node}" ]; then
      echo "Failed to find kind node for ${cluster}"
      record_result "${mode}" "${attempt}" "cluster_create" "FAIL" "${cluster}" "-"
      continue
    fi

    run_pull_test "${mode}" "${attempt}" "${cluster}" "${node}" "canonical_docker_io" "${IMAGE_CANONICAL}"
    run_pull_test "${mode}" "${attempt}" "${cluster}" "${node}" "direct_mirror" "${IMAGE_MIRROR}"
    run_pull_test "${mode}" "${attempt}" "${cluster}" "${node}" "direct_registry1" "${IMAGE_DOCKERHUB}"

    if [ "${KEEP_CLUSTERS}" != "1" ]; then
      kind delete cluster --name "${cluster}" >/dev/null 2>&1 || true
    fi
  done
done

echo
echo "=== Detailed Results ==="
if command -v column >/dev/null 2>&1; then
  column -t -s$'\t' "${RESULTS_FILE}"
else
  cat "${RESULTS_FILE}"
fi

echo
echo "=== Summary (PASS/TOTAL) ==="
awk -F'\t' '
  NR == 1 { next }
  {
    key = $1 "/" $3
    total[key]++
    if ($4 == "PASS") {
      pass[key]++
    }
  }
  END {
    for (key in total) {
      printf "%s\t%d/%d\n", key, pass[key], total[key]
    }
  }
' "${RESULTS_FILE}" | sort

echo
echo "Result logs are in: ${WORK_DIR}"
echo "Set KEEP_CLUSTERS=1 to keep clusters for manual inspection."
echo "Set CLEANUP_WORK_DIR=1 to remove logs automatically on exit."
