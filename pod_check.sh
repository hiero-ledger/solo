#!/bin/bash
date
echo "pid1: $(cat /proc/1/comm)  cmd: $(tr "\0" " " </proc/1/cmdline)"
for i in {1..60}; do
  if [ -S /run/systemd/private ]; then echo "BUS OK"; ls -la /run/systemd; exit 0; fi
  sleep 1
done
echo "BUS STILL MISSING"
ls -la /run /run/systemd || true
mount | egrep "cgroup|/run" || true
ps -ef | egrep "systemd|journald|dbus" || true
exit 1

