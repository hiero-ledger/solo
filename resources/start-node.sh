#!/usr/bin/env bash
set -euo pipefail

: "${STAGE_FILES_TIMEOUT_SECONDS:=600}"
: "${SERVICES_MAIN_TIMEOUT_SECONDS:=480}"
: "${DEFAULT_MAIN_CLASS:=com.hedera.node.app.ServicesMain}"
: "${FALLBACK_MAIN_CLASS:=com.swirlds.platform.Browser}"

log() {
  echo "[start-node.sh][$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
}

pkill -TERM -f "${DEFAULT_MAIN_CLASS//./\\.}" || true
pkill -TERM -f "${FALLBACK_MAIN_CLASS//./\\.}" || true

log "Running stage_files.sh (timeout ${STAGE_FILES_TIMEOUT_SECONDS}s)"
if ! timeout "${STAGE_FILES_TIMEOUT_SECONDS}s" /usr/bin/bash /etc/network-node/startup/stage_files.sh; then
  log "stage_files.sh timed out or failed"
  exit 124
fi

set -a
if [ -f /etc/network-node/application.env ]; then
  # shellcheck disable=SC1091
  . /etc/network-node/application.env
fi
set +a

MAIN_CLASS="${JAVA_MAIN_CLASS:-${DEFAULT_MAIN_CLASS}}"
MAIN_CLASS_REGEX="${MAIN_CLASS//./\\.}"

log "Launching entrypoint"
nohup /usr/bin/bash /opt/hgcapp/services-hedera/HapiApp2.0/entrypoint.sh \
  >>/opt/hgcapp/services-hedera/HapiApp2.0/output/network-node.log 2>&1 &

log "Waiting for ServicesMain to appear (timeout ${SERVICES_MAIN_TIMEOUT_SECONDS}s)"
if ! timeout "${SERVICES_MAIN_TIMEOUT_SECONDS}s" bash -lc "until pgrep -f '${MAIN_CLASS_REGEX}' >/dev/null; do sleep 2; done"; then
  log "Timed out waiting for process '${MAIN_CLASS}'"
  exit 124
fi

log "ServicesMain detected"
