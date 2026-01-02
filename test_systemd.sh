#!/bin/bash

echo "RUNNER_NAME=$RUNNER_NAME"
echo "RUNNER_OS=$RUNNER_OS"
echo "HOSTNAME=$(hostname)"
cat /etc/os-release || true
ps -p 1 -o pid,comm,args || true
ls -la /run/systemd /run/dbus || true
test -S /run/systemd/private && echo "systemd socket OK" || echo "NO systemd socket"
test -S /run/dbus/system_bus_socket && echo "dbus socket OK" || echo "NO dbus socket"
