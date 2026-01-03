#!/usr/bin/env bash
set -euo pipefail

pkill -TERM -f 'com\.hedera\.node\.app\.ServicesMain' || true

timeout 60s /usr/bin/bash /etc/network-node/startup/stage_files.sh

set -a
if [ -f /etc/network-node/application.env ]; then
  # shellcheck disable=SC1091
  . /etc/network-node/application.env
fi
set +a

nohup /usr/bin/bash /opt/hgcapp/services-hedera/HapiApp2.0/entrypoint.sh \
  >>/opt/hgcapp/services-hedera/HapiApp2.0/output/network-node.log 2>&1 &

timeout 60s bash -lc "until pgrep -f 'com\\.hedera\\.node\\.app\\.ServicesMain' >/dev/null; do sleep 2; done"
