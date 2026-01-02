#!/bin/bash

echo "RUNNER_NAME=$RUNNER_NAME"
echo "RUNNER_OS=$RUNNER_OS"
echo "HOSTNAME=$(hostname)"
NAMESPACE=${1}
if [ -z "$NAMESPACE" ]; then
  NAMESPACE=solo-e2e
fi
NETWORK_NODE=${2}
if [ -z "$NETWORK_NODE" ]; then
  NETWORK_NODE=network-node1-0
fi
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- cat /proc/1/comm
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- bash -lc 'test -S /run/systemd/private && echo "bus OK" || (echo "NO bus"; ls -la /run /run/systemd /run/dbus || true)'
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- bash -lc 'systemctl is-system-running || true'
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- bash -lc 'mount | grep -E "cgroup|/sys/fs/cgroup" || true; ls -la /sys/fs/cgroup || true'

