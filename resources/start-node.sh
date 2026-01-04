#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[start-node.sh][$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
}

pkill -TERM -f 'com\.hedera\.node\.app\.ServicesMain' || true

log "Running stage_files.sh (timeout 180s)"
if ! timeout 180s /usr/bin/bash /etc/network-node/startup/stage_files.sh; then
  log "stage_files.sh timed out or failed"
  exit 124
fi

set -a
if [ -f /etc/network-node/application.env ]; then
  # shellcheck disable=SC1091
  . /etc/network-node/application.env
fi
set +a

log "Launching entrypoint"
nohup /usr/bin/bash /opt/hgcapp/services-hedera/HapiApp2.0/entrypoint.sh \
  >>/opt/hgcapp/services-hedera/HapiApp2.0/output/network-node.log 2>&1 &

log "Waiting for ServicesMain to appear (timeout 240s)"
if ! timeout 240s bash -lc "until pgrep -f 'com\\.hedera\\.node\\.app\\.ServicesMain' >/dev/null; do sleep 2; done"; then
  log "Timed out waiting for ServicesMain"
  exit 124
fi

log "ServicesMain detected"
