#!/usr/bin/env bash
set -eo pipefail

task build:compile
# install dependencies in case they haven't been installed yet, and cache args for subsequent commands
npm run solo -- init || exit 1
export PATH=~/.solo/bin:${PATH}

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH
readonly KIND_CONFIG_RENDERER="${SCRIPT_PATH}/../../../.github/workflows/script/render_kind_config.sh"

readonly CLUSTER_DIAGNOSTICS_PATH="${SCRIPT_PATH}/diagnostics/cluster"
readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"

if [[ -n "${SOLO_TEST_CLUSTER}" ]]; then
  SOLO_CLUSTER_NAME="${SOLO_TEST_CLUSTER}"
elif [[ -z "${SOLO_CLUSTER_NAME}" ]]; then
  SOLO_CLUSTER_NAME="solo-e2e"
fi

if [[ -z "${SOLO_CLUSTER_DUALITY}" ]]; then
  SOLO_CLUSTER_DUALITY=2
elif [[ "${SOLO_CLUSTER_DUALITY}" -lt 1 ]]; then
  SOLO_CLUSTER_DUALITY=1
elif [[ "${SOLO_CLUSTER_DUALITY}" -gt 2 ]]; then
  SOLO_CLUSTER_DUALITY=2
fi

KIND_VERSION=$(kind --version | awk '{print $3}')
echo "Using Kind version: ${KIND_VERSION}, $(which kind)"
DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
echo "Using Docker version: ${DOCKER_VERSION}, $(which docker)"
HELM_VERSION=$(helm version --short | sed 's/v//')
echo "Using Helm version: ${HELM_VERSION}, $(which helm)"
KUBECTL_VERSION=$(kubectl version --client=true | grep Client | awk '{print $3}' | sed 's/v//')
echo "Using Kubectl version: ${KUBECTL_VERSION}, $(which kubectl)"
TASK_VERSION=$(task --version | awk '{print $3}')
echo "Using Task version: ${TASK_VERSION}"
NODE_VERSION=$(node --version | sed 's/v//')
echo "Using Node version: ${NODE_VERSION}"
NPM_VERSION=$(npm --version)
echo "Using NPM version: ${NPM_VERSION}"

##### Docker / Kind Hang Diagnostics Helpers #####

readonly RUNNER_DIAG_DIR="${SOLO_DOCKER_DIAG_DIR:-${HOME}/.solo/logs/runner-diagnostics}"
mkdir -p "${RUNNER_DIAG_DIR}"
readonly RUN_STARTED_AT_UTC="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
readonly RUN_STARTED_AT_EPOCH="$(date +%s)"

record_diagnostics() {
  local file_path=$1
  shift
  {
    "$@"
  } 2>&1 | tee -a "${file_path}" >&2
}

# Collects system and Docker-daemon state using non-Docker tools so the function
# still works when the Docker daemon itself is unresponsive.  Call this whenever
# a Docker/Kind command times out (exit code 124) to aid post-mortem analysis.
# All output is written to stderr so it is not polluted by stdout pipes.
collect_docker_hang_diagnostics() {
  local hung_command="${1:-unknown command}"
  local ts
  ts="$(date -u +'%Y%m%dT%H%M%SZ')"
  local diag_file="${RUNNER_DIAG_DIR}/docker-hang-${ts}.log"
  record_diagnostics "${diag_file}" bash -c '
    echo ""
    echo "=== DOCKER HANG DIAGNOSTICS (timed out: '"'"'${hung_command}'"'"') ==="
    echo "--- Run Metadata ---"
    echo "run_started_at_utc: '"'"'${RUN_STARTED_AT_UTC}'"'"'"
    echo "captured_at_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "runner_name: ${RUNNER_NAME:-unknown}"
    echo "runner_os: ${RUNNER_OS:-unknown}"
    echo "runner_arch: ${RUNNER_ARCH:-unknown}"
    echo "github_run_id: ${GITHUB_RUN_ID:-unknown}"
    echo "github_run_attempt: ${GITHUB_RUN_ATTEMPT:-unknown}"
    echo "github_job: ${GITHUB_JOB:-unknown}"
    echo "hostname: $(hostname 2>/dev/null || echo unknown)"
    echo "--- Host uptime ---"
    uptime 2>/dev/null || true
    uptime -s 2>/dev/null || true
    who -b 2>/dev/null || true
    cat /proc/uptime 2>/dev/null || true
    echo "--- Docker daemon service status ---"
    systemctl status docker --no-pager -l 2>/dev/null \
      || service docker status 2>/dev/null \
      || echo "Unable to retrieve docker service status"
    echo "--- containerd service status ---"
    systemctl status containerd --no-pager -l 2>/dev/null \
      || service containerd status 2>/dev/null \
      || echo "Unable to retrieve containerd service status"
    echo "--- Docker socket ---"
    ls -la /var/run/docker.sock 2>/dev/null || echo "Docker socket not found at /var/run/docker.sock"
    echo "--- Processes holding /var/run/docker.sock (lsof) ---"
    lsof /var/run/docker.sock 2>/dev/null || echo "lsof unavailable or no open handles found on docker socket"
    echo "--- Docker / containerd / kind processes (ps) ---"
    ps aux | grep -E '[d]ocker|[c]ontainerd|[k]ind' 2>/dev/null || true
    echo "--- Trigger dockerd goroutine dump (SIGUSR1) ---"
    DOCKERD_PID=$(pidof dockerd 2>/dev/null | awk "{print \$1}" || true)
    if [[ -n "${DOCKERD_PID}" ]]; then
      kill -USR1 "${DOCKERD_PID}" 2>/dev/null \
        || sudo kill -USR1 "${DOCKERD_PID}" 2>/dev/null \
        || echo "Unable to signal dockerd PID ${DOCKERD_PID}"
      sleep 2
      echo "Triggered SIGUSR1 for dockerd PID ${DOCKERD_PID}"
    else
      echo "dockerd PID not found"
    fi
    echo "--- Docker direct probes ---"
    timeout --signal=TERM --kill-after=5s 20s docker version || true
    timeout --signal=TERM --kill-after=5s 20s docker info || true
    timeout --signal=TERM --kill-after=5s 20s docker ps -a --no-trunc --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.CreatedAt}}" || true
    echo "--- System memory ---"
    free -h 2>/dev/null || true
    echo "--- PSI pressure ---"
    cat /proc/pressure/cpu 2>/dev/null || true
    cat /proc/pressure/memory 2>/dev/null || true
    cat /proc/pressure/io 2>/dev/null || true
    echo "--- Disk space ---"
    df -h 2>/dev/null || true
    echo "--- Recent Docker daemon logs (last 400 lines via journalctl) ---"
    journalctl -u docker --no-pager -n 400 2>/dev/null || echo "journalctl unavailable"
    echo "--- Recent containerd logs (last 200 lines via journalctl) ---"
    journalctl -u containerd --no-pager -n 200 2>/dev/null || echo "journalctl unavailable"
    echo "--- Kernel log hints (OOM / hung tasks) ---"
    dmesg -T 2>/dev/null | grep -Ei "oom|hung task|blocked for more than|task .* blocked" | tail -n 200 || true
    echo "=== END DOCKER HANG DIAGNOSTICS ==="
    echo ""
  '
}

# Run a command with a timeout; if it times out (exit code 124) collect hang
# diagnostics automatically before returning the non-zero exit code to the caller.
# Usage: run_with_timeout_diag <seconds> <label> <cmd> [args...]
run_with_timeout_diag() {
  local timeout_seconds=$1
  local label=$2
  shift 2
  timeout --signal=TERM --kill-after=10s "${timeout_seconds}s" "$@"
  local status=$?
  if [[ $status -eq 124 ]]; then
    echo "WARNING: '${label}' timed out after ${timeout_seconds}s" >&2
    collect_docker_hang_diagnostics "${label}"
  fi
  return $status
}

# Detect a non-responsive Docker daemon once and short-circuit further Docker/Kind
# cleanup calls to avoid repeated timeout stalls.
docker_is_responsive() {
  timeout --signal=TERM --kill-after=5s 15s docker version >/dev/null 2>&1
}

# Collects baseline evidence to prove whether the runner starts from stale state.
collect_runner_freshness_baseline() {
  local baseline_file="${RUNNER_DIAG_DIR}/runner-freshness-baseline.txt"
  record_diagnostics "${baseline_file}" bash -c '
    echo "=== RUNNER FRESHNESS BASELINE ==="
    echo "captured_at_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "run_started_at_utc: '"'"'${RUN_STARTED_AT_UTC}'"'"'"
    echo "run_started_at_epoch: '"'"'${RUN_STARTED_AT_EPOCH}'"'"'"
    echo "runner_name: ${RUNNER_NAME:-unknown}"
    echo "runner_os: ${RUNNER_OS:-unknown}"
    echo "runner_arch: ${RUNNER_ARCH:-unknown}"
    echo "github_repository: ${GITHUB_REPOSITORY:-unknown}"
    echo "github_run_id: ${GITHUB_RUN_ID:-unknown}"
    echo "github_run_attempt: ${GITHUB_RUN_ATTEMPT:-unknown}"
    echo "github_job: ${GITHUB_JOB:-unknown}"
    echo "hostname: $(hostname 2>/dev/null || echo unknown)"
    echo ""
    echo "--- Host boot and uptime evidence ---"
    uptime 2>/dev/null || true
    uptime -s 2>/dev/null || true
    who -b 2>/dev/null || true
    cat /proc/uptime 2>/dev/null || true
    echo ""
    echo "--- Workspace top-level entries (evidence of prior residue) ---"
    ls -la "${GITHUB_WORKSPACE:-$PWD}" 2>/dev/null || true
    echo ""
    echo "--- Existing runner work directories ---"
    ls -la "${GITHUB_WORKSPACE%/*}" 2>/dev/null || true
    echo ""
    echo "--- Existing kind clusters before cleanup ---"
    timeout --signal=TERM --kill-after=5s 20s kind get clusters || true
    echo ""
    echo "--- Existing Docker containers before cleanup ---"
    timeout --signal=TERM --kill-after=5s 20s docker ps -a --no-trunc --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.CreatedAt}}" || true
    echo ""
    echo "--- Existing Docker networks before cleanup ---"
    timeout --signal=TERM --kill-after=5s 20s docker network ls || true
    echo ""
    echo "--- Existing Docker volumes before cleanup ---"
    timeout --signal=TERM --kill-after=5s 20s docker volume ls || true
    echo ""
    echo "--- Docker health probe before cleanup ---"
    timeout --signal=TERM --kill-after=5s 20s docker version || true
    timeout --signal=TERM --kill-after=5s 20s docker info || true
    echo "=== END RUNNER FRESHNESS BASELINE ==="
  '
}

collect_runner_freshness_baseline

##### Pre-cleanup Diagnostics (proves stale state from prior runs on self-hosted runners) #####
echo "=== Existing kind clusters ==="
if docker_is_responsive; then
  run_with_timeout_diag 30 "kind get clusters" kind get clusters || true
else
  echo "WARNING: Docker daemon appears unresponsive before cleanup; collecting diagnostics and skipping Docker/Kind cleanup calls." >&2
  collect_docker_hang_diagnostics "docker version pre-cleanup health check"
fi
echo "=== Existing Docker networks ==="
docker_is_responsive && run_with_timeout_diag 30 "docker network ls" docker network ls || true
echo "=== Docker containers (all) ==="
docker_is_responsive && run_with_timeout_diag 30 "docker ps -a" docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}' || true

if docker_is_responsive; then
  for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
    run_with_timeout_diag 60 "kind delete cluster ${SOLO_CLUSTER_NAME}-c${i}" kind delete cluster -n "${SOLO_CLUSTER_NAME}-c${i}" || true
  done
fi

# On Windows (Docker Desktop), the bridge network plugin is not available via the v1
# plugin registry. Kind manages its own Docker network automatically on Windows, so
# manual network creation is not needed and will fail. Skip it on Windows (msys/Git Bash).
if [[ "$OSTYPE" != msys* ]]; then
  if docker_is_responsive; then
    run_with_timeout_diag 30 "docker network rm kind" docker network rm -f kind || true
    run_with_timeout_diag 60 "docker network create kind" docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge
  else
    echo "Skipping Docker network reset because Docker daemon is unresponsive." >&2
  fi
fi
docker_is_responsive && run_with_timeout_diag 30 "docker info" docker info | grep -i cgroup || true

# Setup Helm Repos
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ --force-update
helm repo add metallb https://metallb.github.io/metallb --force-update

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  cluster_kind_config="${SCRIPT_PATH}/kind-cluster-${i}.yaml"
  if [[ -x "${KIND_CONFIG_RENDERER}" && -n "${KIND_DOCKER_REGISTRY_MIRRORS:-}" ]]; then
    rendered_cluster_kind_config="$(mktemp -t kind-cluster-${i}-XXXX.yaml)"
    "${KIND_CONFIG_RENDERER}" "${cluster_kind_config}" "${rendered_cluster_kind_config}"
    run_with_timeout_diag 600 "kind create cluster ${SOLO_CLUSTER_NAME}-c${i}" kind create cluster -n "${SOLO_CLUSTER_NAME}-c${i}" --image "${KIND_IMAGE}" --config "${rendered_cluster_kind_config}" || exit 1
    rm -f "${rendered_cluster_kind_config}"
  else
    run_with_timeout_diag 600 "kind create cluster ${SOLO_CLUSTER_NAME}-c${i}" kind create cluster -n "${SOLO_CLUSTER_NAME}-c${i}" --image "${KIND_IMAGE}" --config "${cluster_kind_config}" || exit 1
  fi

  helm upgrade --install metrics-server metrics-server/metrics-server \
    --namespace kube-system \
    --set "args[0]=--kubelet-insecure-tls" \
    --wait

  # Wait for metrics server to be ready
  kubectl wait --for=condition=available --timeout=300s deployment/metrics-server -n kube-system

  # Only install metallb when running multi-cluster (metalLB is unnecessary for our single-cluster KinD E2E)
  if [[ "${SOLO_CLUSTER_DUALITY}" -gt 1 ]]; then
    helm upgrade --install metallb metallb/metallb \
      --namespace metallb-system --create-namespace --atomic --wait \
      --set speaker.frr.enabled=true

    kubectl apply -f "${SCRIPT_PATH}/metallb-cluster-${i}.yaml"
  else
    echo "Skipping metallb install for single-cluster test run"
  fi

  # Deploy the diagnostics container if not running in CI
  if [[ -z "${CI}" ]]; then
    "${CLUSTER_DIAGNOSTICS_PATH}"/deploy.sh
  fi
done

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# --chart-dir ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c${i}"
  npm run solo -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
  helm list --all-namespaces
done

kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c1"
sleep 10 # give time for solo-setup to finish deploying
