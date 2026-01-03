#!/bin/bash

# A defensive probe that tries to gather as much information as possible, even if commands fail.
# Never exit early unless the DBus socket appears and we can confirm systemd is healthy.

set -u

log() {
  local timestamp
  if timestamp="$(date -u '+%F %T' 2>/dev/null)"; then
    :
  else
    timestamp="unknown-timestamp"
  fi
  echo "[${timestamp}] $*"
}

run_cmd() {
  local description="$1"
  shift

  log ">>> ${description}"
  if "$@"; then
    log "<<< SUCCESS ${description}"
  else
    local status=$?
    log "<<< FAILED (${status}) ${description}"
  fi
}

log "Starting pod_check.sh"
run_cmd "Show PID 1 details" bash -c 'echo "pid1: $(cat /proc/1/comm) cmd: $(tr "\0" " " </proc/1/cmdline)"'

bus_ready=0
for i in {1..60}; do
  if [ -S /run/systemd/private ]; then
    bus_ready=1
    log "systemd DBus socket detected (attempt ${i})"
    break
  fi
  sleep 1
done

if [ "${bus_ready}" -eq 1 ]; then
  run_cmd "List /run/systemd" ls -la /run/systemd
  run_cmd "systemctl status" systemctl status
  log "BUS OK"
  exit 0
fi

log "BUS STILL MISSING after 60 seconds"
run_cmd "List /run and /run/systemd" ls -la /run /run/systemd
run_cmd "Show mountpoints for cgroup or /run" bash -c 'mount | egrep "cgroup|/run"'
run_cmd "Show systemd/journald/dbus processes" bash -c 'ps -ef | egrep "systemd|journald|dbus"'
run_cmd "Show recent journal (if available)" journalctl -n 100 --no-pager

exit 1
