#!/usr/bin/env bash
set -euo pipefail

TARGET_NOFILE="${1:-1048576}"

current_ulimit=$(ulimit -n || true)
echo "Current ulimit -n: ${current_ulimit}"

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  echo "Configuring Docker LimitNOFILE via systemd override"
  sudo mkdir -p /etc/systemd/system/docker.service.d
  printf "[Service]\nLimitNOFILE=%s\n" "${TARGET_NOFILE}" | sudo tee /etc/systemd/system/docker.service.d/override.conf >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl restart docker
else
  echo "systemd not available; applying Docker default-ulimits via daemon.json"
  sudo mkdir -p /etc/docker
  if [ -f /etc/docker/daemon.json ]; then
    sudo jq --arg limit "${TARGET_NOFILE}" '
      . + {"default-ulimits":{"nofile":{"Name":"nofile","Hard":($limit|tonumber),"Soft":($limit|tonumber)}}}
    ' /etc/docker/daemon.json | sudo tee /etc/docker/daemon.json.tmp >/dev/null
    sudo mv /etc/docker/daemon.json.tmp /etc/docker/daemon.json
  else
    cat <<EOF | sudo tee /etc/docker/daemon.json >/dev/null
{
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Soft": ${TARGET_NOFILE},
      "Hard": ${TARGET_NOFILE}
    }
  }
}
EOF
  fi
  sudo service docker restart || sudo /etc/init.d/docker restart || true
fi

ulimit -n "${TARGET_NOFILE}" || true
echo "Updated ulimit -n: $(ulimit -n)"

docker info | sed -n '1,80p'
