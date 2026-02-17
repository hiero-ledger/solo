#!/usr/bin/env bash
set -euo pipefail

DEFAULT_SOLO_COMMAND="npm run solo --"
DEFAULT_DEPLOYMENT="one-shot-interrupt"
DEFAULT_INTERRUPT_SECONDS="60 90 120 150 180 210 240 270 300 330 360 390 420"
DEFAULT_JITTER_SECONDS="10"
DEFAULT_MAX_DESTROY_ATTEMPTS="8"
DEFAULT_DESTROY_SLEEP_SECS="20"
DEFAULT_DESTROY_TIMEOUT_SECS="300"
DEFAULT_CLEAN_DEPLOY_TIMEOUT_SECS="180"

usage() {
  cat <<'EOF'
Usage:
  one-shot-interrupt-destroy.sh [options] [seconds...]

Options:
  -c, --command CMD        Solo command prefix (default: "npm run solo --")
  -d, --deployment NAME    Deployment name (default: "one-shot-interrupt")
  -j, --jitter SECONDS     Jitter seconds (+/-) (default: 10)
  -r, --retries N          Destroy retry attempts (default: 8)
  -s, --sleep SECONDS      Destroy retry sleep seconds (default: 20)
  -h, --help               Show help

Examples:
  .github/workflows/script/one-shot-interrupt-destroy.sh 60 120 180
  .github/workflows/script/one-shot-interrupt-destroy.sh -d my-deploy -j 15
  SOLO_COMMAND="npx @hashgraph/solo" .github/workflows/script/one-shot-interrupt-destroy.sh
EOF
}

SOLO_COMMAND="${SOLO_COMMAND:-$DEFAULT_SOLO_COMMAND}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-$DEFAULT_DEPLOYMENT}"
INTERRUPT_SECONDS="${INTERRUPT_SECONDS:-$DEFAULT_INTERRUPT_SECONDS}"
JITTER_SECONDS="${JITTER_SECONDS:-$DEFAULT_JITTER_SECONDS}"
MAX_DESTROY_ATTEMPTS="${MAX_DESTROY_ATTEMPTS:-$DEFAULT_MAX_DESTROY_ATTEMPTS}"
DESTROY_SLEEP_SECS="${DESTROY_SLEEP_SECS:-$DEFAULT_DESTROY_SLEEP_SECS}"
DESTROY_TIMEOUT_SECS="${DESTROY_TIMEOUT_SECS:-$DEFAULT_DESTROY_TIMEOUT_SECS}"
CLEAN_DEPLOY_TIMEOUT_SECS="${CLEAN_DEPLOY_TIMEOUT_SECS:-$DEFAULT_CLEAN_DEPLOY_TIMEOUT_SECS}"

log() {
  printf '%s\n' "$*"
}

log_banner() {
  local title="$1"
  printf '\n============================================================\n'
  printf '%s\n' "${title}"
  printf '============================================================\n'
}

cleanup_running="false"
last_command_output=""

on_interrupt() {
  log "Received interrupt; attempting cleanup."
  if [ "${cleanup_running}" = "true" ]; then
    exit 130
  fi
  cleanup_running="true"
  run_destroy_with_retry "signal" || true
  exit 130
}

trap on_interrupt INT TERM

timeout_cmd() {
  local timeout_secs="$1"
  shift
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${timeout_secs}" "$@"
  elif command -v timeout >/dev/null 2>&1; then
    timeout "${timeout_secs}" "$@"
  else
    perl -e 'my $t=shift; alarm $t; exec @ARGV' "${timeout_secs}" "$@"
  fi
}

run_command_with_timeout() {
  local label="$1"
  local timeout_secs="$2"
  local cmd="$3"
  local output_file=""
  local exit_code=0

  output_file="$(mktemp)"
  set +e
  timeout_cmd "${timeout_secs}" bash -c "${cmd}" 2>&1 | tee "${output_file}"
  exit_code=${PIPESTATUS[0]}
  set -e

  if [ "${exit_code}" -eq 124 ]; then
    log "${label} timed out after ${timeout_secs}s"
  fi

  last_command_output="$(cat "${output_file}")"
  rm -f "${output_file}"
  return "${exit_code}"
}

run_destroy_with_retry() {
  local label="$1"
  local attempt=1
  local exit_code=0

  while [ "${attempt}" -le "${MAX_DESTROY_ATTEMPTS}" ]; do
    log "Running one-shot destroy (${label}) attempt ${attempt}/${MAX_DESTROY_ATTEMPTS}"
    run_command_with_timeout "Destroy" "${DESTROY_TIMEOUT_SECS}" \
      "${SOLO_COMMAND} one-shot single destroy --quiet-mode"
    exit_code=$?

    if echo "${last_command_output}" | grep -Eq "Deployments? name is not found in local config"; then
      log "No deployment in local config; nothing to destroy."
      return 0
    fi
    if [ "${exit_code}" -eq 0 ]; then
      return 0
    fi

    log "Destroy attempt ${attempt} failed (exit ${exit_code}); retrying in ${DESTROY_SLEEP_SECS}s"
    sleep "${DESTROY_SLEEP_SECS}"
    attempt=$((attempt + 1))
  done

  log "Destroy failed after ${MAX_DESTROY_ATTEMPTS} attempts."
  return "${exit_code}"
}

reset_to_fresh_cluster() {
  log "Resetting environment to a clean state"
  if command -v kind >/dev/null 2>&1; then
    local cluster=""
    while IFS= read -r cluster; do
      [ -z "${cluster}" ] && continue
      log "Deleting kind cluster: ${cluster}"
      kind delete cluster --name "${cluster}" >/dev/null 2>&1 || true
    done < <(kind get clusters 2>/dev/null || true)
  fi

  if [ -d "${HOME}/.solo" ]; then
    rm -rf "${HOME}/.solo"/* || true
    log "Removed ${HOME}/.solo/*"
  fi
}

run_with_interrupt() {
  local base_secs="$1"
  local label="$2"
  local jitter=$((RANDOM % (JITTER_SECONDS * 2 + 1) - JITTER_SECONDS))
  local sleep_secs=$((base_secs + jitter))
  local deploy_exit=0

  if [ "${sleep_secs}" -lt 1 ]; then
    sleep_secs=1
  fi

  log_banner "Testing interrupt interval ${base_secs}s (${label}m)"
  log "Starting one-shot deploy; interrupt after ${sleep_secs}s (base ${label}m, jitter ${jitter}s)"
  reset_to_fresh_cluster

  set +e
  run_command_with_timeout "Deploy" "${sleep_secs}" \
    "${SOLO_COMMAND} one-shot single deploy --deployment \"${SOLO_DEPLOYMENT}\" --quiet-mode"
  deploy_exit=$?
  set -e
  if [ "${deploy_exit}" -ne 0 ]; then
    log "Deploy exited with ${deploy_exit} (expected when interrupted)."
  fi

  run_destroy_with_retry "post-interrupt" || true

  log "Running clean one-shot deploy (no interrupt) for ${label}m"
  set +e
  run_command_with_timeout "Clean deploy" "${CLEAN_DEPLOY_TIMEOUT_SECS}" \
    "${SOLO_COMMAND} one-shot single deploy --deployment \"${SOLO_DEPLOYMENT}\" --quiet-mode"
  deploy_exit=$?
  set -e
  if [ "${deploy_exit}" -ne 0 ]; then
    log "Clean deploy exited with ${deploy_exit}."
  fi
  run_destroy_with_retry "post-clean" || true

  log "Done for ${label}m"
  return 0
}

parse_args() {
  local args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -c|--command)
        SOLO_COMMAND="$2"
        shift 2
        ;;
      -d|--deployment)
        SOLO_DEPLOYMENT="$2"
        shift 2
        ;;
      -j|--jitter)
        JITTER_SECONDS="$2"
        shift 2
        ;;
      -r|--retries)
        MAX_DESTROY_ATTEMPTS="$2"
        shift 2
        ;;
      -s|--sleep)
        DESTROY_SLEEP_SECS="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done

  if [ "${#args[@]}" -gt 0 ]; then
    INTERRUPT_SECONDS="${args[*]}"
  fi
}

main() {
  parse_args "$@"
  for base_secs in ${INTERRUPT_SECONDS}; do
    label=$(awk -v s="${base_secs}" 'BEGIN {printf "%.1f", s/60}')
    run_with_interrupt "${base_secs}" "${label}" || true
  done
}

main "$@"
