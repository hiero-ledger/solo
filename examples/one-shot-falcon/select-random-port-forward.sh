#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${LOG_FILE:-}"
MODE="select"
ITERATIONS=1
KILLED_PORT_FILE="${KILLED_PORT_FILE:-/tmp/killed_port.txt}"

log() {
  local msg="$1"
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') [port-forward-random] ${msg}"
  echo "${line}"
  if [ -n "${LOG_FILE}" ]; then
    echo "${line}" >> "${LOG_FILE}"
  fi
}

usage() {
  cat <<'EOF'
Usage:
  select-random-port-forward.sh [--select|--kill] [--iterations N] [--log-file PATH] [--killed-port-file PATH]

Options:
  --select            Select a random port-forward target (default)
  --kill              Select and kill all kubectl port-forward pids on the selected local port
  --iterations N      Repeat selection N times (selection-only mode)
  --log-file PATH     Append logs to a file
  --killed-port-file  File to write the selected/killed local port
  -h, --help          Show this help

Output variables:
  SELECTED_PORT=<port>
  TARGET_PIDS=<space-separated-pids>
EOF
}

contains_port() {
  local needle="$1"
  shift || true
  local item
  for item in "$@"; do
    if [ "${item}" = "${needle}" ]; then
      return 0
    fi
  done
  return 1
}

collect_unique_ports() {
  local -a ports=()
  local port
  while IFS= read -r port; do
    [ -z "${port}" ] && continue
    if ! contains_port "${port}" "${ports[@]-}"; then
      ports+=("${port}")
    fi
  done < <(ps -ef | awk '/[k]ubectl port-forward/ {split($NF, a, ":"); if (a[1] ~ /^[0-9]+$/) print a[1]}')

  echo "${ports[@]-}"
}

collect_pids_for_port() {
  local port="$1"
  ps -ef | awk -v p="${port}" '/[k]ubectl port-forward/ {if ($NF ~ ("^" p ":")) print $2}'
}

seed_random() {
  local seed
  seed="$(od -An -N2 -tu2 /dev/urandom | tr -d ' ')"
  [ -n "${seed}" ] && RANDOM="${seed}"
}

select_random_port_forward_target() {
  local ports_line
  ports_line="$(collect_unique_ports)"
  local -a ports
  # shellcheck disable=SC2206
  ports=(${ports_line})

  local count="${#ports[@]}"
  if [ "${count}" -eq 0 ]; then
    log "No kubectl port-forward process found"
    return 1
  fi

  seed_random
  local rand_value="${RANDOM}"
  local idx=$((rand_value % count))
  local selected_port="${ports[$idx]}"

  log "Available local ports: ${ports[*]}"
  log "Random value=${rand_value}, selected index=${idx}, selected port=${selected_port}"

  local pids
  pids="$(collect_pids_for_port "${selected_port}" | tr '\n' ' ' | xargs || true)"
  if [ -z "${pids}" ]; then
    log "No matching PID found for selected port ${selected_port}"
    return 1
  fi

  echo "SELECTED_PORT=${selected_port}"
  echo "TARGET_PIDS=${pids}"
}

kill_selected_target() {
  local selected_port="$1"
  local target_pids="$2"
  local pid

  log "Killing PIDs for port ${selected_port}: ${target_pids}"
  for pid in ${target_pids}; do
    kill -9 "${pid}" 2>/dev/null || true
  done

  sleep 2

  local remaining
  remaining="$(collect_pids_for_port "${selected_port}" | tr '\n' ' ' | xargs || true)"
  if [ -n "${remaining}" ]; then
    log "ERROR: Remaining PID(s) still running for port ${selected_port}: ${remaining}"
    return 1
  fi

  echo "${selected_port}" > "${KILLED_PORT_FILE}"
  log "Killed successfully; wrote selected port ${selected_port} to ${KILLED_PORT_FILE}"
}

while [ "${#}" -gt 0 ]; do
  case "$1" in
    --select)
      MODE="select"
      shift
      ;;
    --kill)
      MODE="kill"
      shift
      ;;
    --iterations)
      ITERATIONS="${2:-}"
      shift 2
      ;;
    --log-file)
      LOG_FILE="${2:-}"
      shift 2
      ;;
    --killed-port-file)
      KILLED_PORT_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! echo "${ITERATIONS}" | grep -qE '^[0-9]+$' || [ "${ITERATIONS}" -lt 1 ]; then
  echo "Invalid --iterations value: ${ITERATIONS}" >&2
  exit 1
fi

if [ "${MODE}" = "kill" ] && [ "${ITERATIONS}" -ne 1 ]; then
  echo "--kill mode supports only --iterations 1" >&2
  exit 1
fi

run_once() {
  local output
  output="$(select_random_port_forward_target)"
  echo "${output}"
}

if [ "${MODE}" = "select" ]; then
  i=1
  while [ "${i}" -le "${ITERATIONS}" ]; do
    log "Selection iteration ${i}/${ITERATIONS}"
    run_once
    i=$((i + 1))
  done
  exit 0
fi

output="$(run_once)"
selected_port="$(echo "${output}" | awk -F= '/^SELECTED_PORT=/{print $2}')"
target_pids="$(echo "${output}" | awk -F= '/^TARGET_PIDS=/{print $2}')"
echo "${output}"
kill_selected_target "${selected_port}" "${target_pids}"
