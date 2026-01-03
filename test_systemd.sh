
#!/bin/bash

echo "RUNNER_NAME=$RUNNER_NAME"
echo "RUNNER_OS=$RUNNER_OS"
echo "HOSTNAME=$(hostname)"
NAMESPACE=${1}
NETWORK_NODE=${2}

echo "NAMESPACE=$NAMESPACE"
echo "NETWORK_NODE=$NETWORK_NODE"
echo "HOST /etc/os-release:"
cat /etc/os-release || echo "unable to read /etc/os-release"
echo "HOST kernel:"
uname -a

kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- cat /proc/1/comm
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- bash -lc 'test -S /run/systemd/private && echo "bus OK" || (echo "NO bus"; ls -la /run /run/systemd /run/dbus || true)'
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- bash -lc 'systemctl is-system-running || true'
kubectl -n "$NAMESPACE" exec "$NETWORK_NODE" -c root-container -- bash -lc 'mount | grep -E "cgroup|/sys/fs/cgroup" || true; ls -la /sys/fs/cgroup || true'

