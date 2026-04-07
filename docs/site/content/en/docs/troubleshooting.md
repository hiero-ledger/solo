---
title: "Troubleshooting"
weight: 55
description: >
  Solutions to common issues when using Solo, plus guidance on getting help.
type: docs
---

This guide covers common issues you may encounter when using Solo and how to resolve them.

## Common Issues and Solutions

### Pods Not Starting

If pods remain in `Pending` or `CrashLoopBackOff` state:

#### Check Pod Events

```bash
# List all pods in your namespace
kubectl get pods -n "${SOLO_NAMESPACE}"

# Describe a specific pod to see events
kubectl describe pod -n "${SOLO_NAMESPACE}" <pod-name>
```

#### Common Causes and Fixes

| Symptom | Cause | Solution |
|---------|-------|----------|
| `Pending` state | Insufficient resources | Increase Docker memory/CPU allocation |
| `Pending` state | Storage issues | Check available disk space, restart Docker |
| `CrashLoopBackOff` | Container failing to start | Check pod logs: `kubectl logs -n "${SOLO_NAMESPACE}" <pod-name>` |
| `ImagePullBackOff` | Can't pull container images | Check internet connection, Docker Hub rate limits |

#### Resource Allocation

Ensure Docker has adequate resources:
- **Memory**: At least 12 GB (16 GB recommended)
- **CPU**: At least 6 cores (8 recommended)
- **Disk**: At least 20 GB free

On Docker Desktop, check: **Settings > Resources**

### Connection Refused Errors

If you can't connect to network endpoints:

#### Check Service Endpoints

```bash
# List all services
kubectl get svc -n "${SOLO_NAMESPACE}"

# Check if endpoints are populated
kubectl get endpoints -n "${SOLO_NAMESPACE}"
```

#### Manual Port Forwarding

If automatic port forwarding isn't working:

```bash
# Consensus Node (gRPC)
kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 35211:50211 &

# Explorer UI
kubectl port-forward svc/hiero-explorer -n "${SOLO_NAMESPACE}" 38080:8080 &

# Mirror Node gRPC
kubectl port-forward svc/mirror-1-grpc -n "${SOLO_NAMESPACE}" 5600:5600 &

# Mirror Node REST
kubectl port-forward svc/mirror-1-rest -n "${SOLO_NAMESPACE}" 5551:80 &

# JSON RPC Relay
kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 37546:7546 &
```

### Node Synchronization Issues

If nodes aren't forming consensus or transactions aren't being processed:

#### Check Node Status

```bash
# Download state information
solo consensus state download --deployment "${SOLO_DEPLOYMENT}" --node-aliases node1

# Check logs for gossip issues
kubectl logs -n "${SOLO_NAMESPACE}" network-node-0 | grep -i gossip
```

#### Restart Problematic Nodes

```bash
# Refresh a specific node
solo consensus node refresh --node-aliases node1 --deployment "${SOLO_DEPLOYMENT}"

# Or restart all nodes
solo consensus node restart --deployment "${SOLO_DEPLOYMENT}"
```

### Mirror Node Not Importing Records

If the mirror node isn't showing new transactions:

#### Verify Pinger is Running

The `--pinger` flag should have been used when deploying the mirror node. The pinger sends periodic transactions to ensure record files are created.

```bash
# Check if pinger pod is running
kubectl get pods -n "${SOLO_NAMESPACE}" | grep pinger
```

#### Redeploy Mirror Node with Pinger

```bash
# Destroy existing mirror node
solo mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force

# Redeploy with pinger enabled
solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger
```

### JSON-RPC Relay Out of Memory

If the relay or relay-ws pods are being killed (OOMKilled) or restarting due to memory pressure:

#### Understanding the Default Memory Configuration

Solo ships with a default memory limit of **88Mi** and an explicit V8 old-space cap of **66MB** (`--max-old-space-size=66`) for both the relay and WebSocket services. These values are tuned for the one-shot development profile and may not be sufficient for heavy workloads.

#### How Node.js Memory Works in Containers

Since [Node.js 12.7.0](https://nodejs.org/en/blog/release/v12.7.0), Node.js reads the Linux cgroup memory limit set by Kubernetes to determine the V8 old-space heap size, rather than using the host's physical memory. Based on V8's internal heap sizing heuristics, this tends to be roughly **~50% of the container memory limit** on 64-bit systems, though the exact value depends on V8 internals and varies at both ends of the memory spectrum.

A couple of things to be aware of:

- **cgroup v2 environments**: many modern Linux distributions enable cgroup v2 by default, and [Kubernetes 1.25 brought cgroup v2 support to GA](https://kubernetes.io/blog/2022/08/31/cgroupv2-ga-1-25/). Older Node.js versions may not correctly detect the container limit under cgroup v2 and could silently fall back to the host's physical memory, allocating a much larger heap than intended. This was improved in at least **Node.js 20.3.0**, which upgraded libuv to 1.45.0.
- When `--max-old-space-size` is explicitly set (as in Solo's default config), it **overrides** the auto-sizing entirely — the cgroup-based detection only kicks in when no explicit value is provided.

This means:

- If you increase only the pod memory limit (e.g., to 256Mi) but leave `NODE_OPTIONS` unchanged, old space stays at 66 MB
- If you remove `NODE_OPTIONS`, Node.js will attempt to auto-size old space based on the container limit (roughly ~128 MB for a 256Mi pod on a modern Node.js version)

#### Adjusting Memory for Heavier Workloads

Create a custom values file (e.g., `custom-relay-values.yaml`) and pass it when deploying:

```yaml
# Option 1: Explicit old-space control (recommended for precise tuning)
relay:
  resources:
    limits:
      memory: 256Mi
  config:
    NODE_OPTIONS: "--max-old-space-size=192"
ws:
  resources:
    limits:
      memory: 256Mi
  config:
    NODE_OPTIONS: "--max-old-space-size=192"

# Option 2: Let Node.js auto-detect (simpler, old space ≈ 50% of limit)
# relay:
#   resources:
#     limits:
#       memory: 256Mi
#   config:
#     NODE_OPTIONS: ""
# ws:
#   resources:
#     limits:
#       memory: 256Mi
#   config:
#     NODE_OPTIONS: ""
```

Then deploy or upgrade with:

```bash
solo relay node add --deployment "${SOLO_DEPLOYMENT}" --values-file custom-relay-values.yaml
# or
solo relay node upgrade --deployment "${SOLO_DEPLOYMENT}" --values-file custom-relay-values.yaml
```

### Helm Repository Errors

If you see errors like `repository name already exists`:

```bash
# List current Helm repos
helm repo list

# Remove conflicting repository
helm repo remove <repo-name>

# Example: remove hedera-json-rpc-relay
helm repo remove hedera-json-rpc-relay
```

### Kind Cluster Issues

#### Cluster Won't Start

```bash
# Delete and recreate the cluster
kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
```

#### Docker Context Issues

Ensure Docker is running and the correct context is set:

```bash
# Check Docker is running
docker ps

# On macOS/Windows, ensure Docker Desktop is started
# On Linux, ensure the Docker daemon is running:
sudo systemctl start docker
```

### Old Installation Artifacts

Previous Solo installations can cause issues. Clean up Solo-managed clusters:

```bash
# Delete only Solo-managed Kind clusters (names starting with "solo")
kind get clusters | grep '^solo' | while read cluster; do
  kind delete cluster -n "$cluster"
done

# Remove Solo configuration and cache
rm -rf ~/.solo
```

## Collecting Diagnostic Information

Before seeking help, collect diagnostic information:

### Solo Diagnostics

```bash
# Capture comprehensive diagnostics
solo consensus diagnostics all --deployment "${SOLO_DEPLOYMENT}"
```

This creates logs and diagnostic files in `~/.solo/logs/`.

### Key Log Files

| File | Description |
|------|-------------|
| `~/.solo/logs/solo.log` | Solo CLI command logs |
| `~/.solo/logs/hashgraph-sdk.log` | SDK transaction logs |

### Kubernetes Diagnostics

```bash
# Cluster info
kubectl cluster-info

# All resources in namespace
kubectl get all -n "${SOLO_NAMESPACE}"

# Recent events
kubectl get events -n "${SOLO_NAMESPACE}" --sort-by='.lastTimestamp'

# Node resource usage
kubectl top nodes
kubectl top pods -n "${SOLO_NAMESPACE}"
```

## Getting Help

### 1. Check the Logs

Always start by examining logs:

```bash
# Solo logs
cat ~/.solo/logs/solo.log | tail -100

# Pod logs
kubectl logs -n "${SOLO_NAMESPACE}" <pod-name>
```

### 2. Documentation

- [Solo User Guide](solo-user-guide.md) - Basic setup and usage
- [Advanced Deployments](advanced-deployments.md) - Complex deployment scenarios
- [FAQ](faq.md) - Common questions and answers
- [CLI Commands](solo-commands.md) - Complete command reference

### 3. GitHub Issues

Report bugs or request features:
- **Repository**: https://github.com/hiero-ledger/solo/issues

When opening an issue, include:
- Solo version (`solo --version`)
- Operating system and version
- Docker/Kubernetes versions
- Steps to reproduce the issue
- Relevant log output
- Any error messages

### 4. Community Support

Join the community for discussions and help:
- **Hedera Discord**: Look for the `#solo` channel
- **Hiero Community**: https://hiero.org/community

## Frequently Asked Questions

### How do I reset everything and start fresh?

```bash
# Delete only Solo-managed clusters and Solo config
kind get clusters | grep '^solo' | while read cluster; do
  kind delete cluster -n "$cluster"
done
rm -rf ~/.solo

# Deploy fresh
solo one-shot single deploy
```

### How do I check which version of Solo I'm running?

```bash
solo --version

# For machine-readable output:
solo --version -o json
```

### Where are my keys stored?

Keys are stored in `~/.solo/cache/keys/`. This directory contains:
- TLS certificates (`hedera-node*.crt`, `hedera-node*.key`)
- Signing keys (`s-private-node*.pem`, `s-public-node*.pem`)

### How do I connect my application to the local network?

Use these endpoints:
- **gRPC (Hedera SDK)**: `localhost:35211`, Node ID: `0.0.3`
- **JSON RPC (Ethereum tools)**: `http://localhost:37546`
- **Mirror Node REST**: `http://localhost:5551/api/v1/`

### Can I run Solo on a remote server?

Yes, Solo can deploy to any Kubernetes cluster. See [Advanced Deployments](advanced-deployments.md#connecting-to-a-remote-cluster) for details.
