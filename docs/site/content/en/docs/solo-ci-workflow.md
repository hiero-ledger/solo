---
title: "Solo CI Workflow"
weight: 130
description: >
    This document describes how to use Solo in CI.
type: docs
---

This guide walks you through setting up and deploying a Solo network in a continuous integration (CI) environment.
You’ll verify that your runner meets Docker resource requirements, install the necessary dependencies, and deploy Solo to a local cluster.

## Step 1: Verify Runner and Docker Resources

You can use GitHub runners or self-hosted runners to deploy Solo.

### Minimum Requirements
- 6 CPU cores
- 12 GB of memory

If these requirements aren’t met, some Solo components may hang or fail to install during deployment.

NOTE: The Kubernetes cluster will never get full access to the memory available to the host.  So, even though we say that 12 GB Memory is a requirement, that is a host requirement, and Solo would be limited to a percentage of the 12 GB limit.  If the host is Docker, then setting Docker to 12 GB of memory, would limit the Kubernetes cluster deployed possibly by Kind (Kubernetes-in-Docker) to less than 12 GB of memory.  Furthermore, the longer Solo runs, and as the transaction load increases, so will its CPU and memory utilization.  These minimum requirements should work with `solo one-shot single deploy` as documented here.

### Check Docker Resources

Add the following step to your workflow to verify your Docker environment:

```yaml
  - name: Check Docker Resources
    run: |
      read cpus mem <<<"$(docker info --format '{{.NCPU}} {{.MemTotal}}')"
      mem_gb=$(awk -v m="$mem" 'BEGIN{printf "%.1f", m/1000000000}')
      echo "CPU cores: $cpus"
      echo "Memory: ${mem_gb} GB"
```
Expected Output:
CPU cores: 6
Memory: 12 GB

## Step 2: Set Up Kind

Next, install Kind to create and manage a local Kubernetes cluster in your workflow.

```yaml
  - name: Setup Kind
    uses: helm/kind-action@a1b0e391336a6ee6713a0583f8c6240d70863de3
    with:
      install_only: true
      node_image: kindest/node:v1.34.0@sha256:7416a61b42b1662ca6ca89f02028ac133a309a2a30ba309614e8ec94d976dc5a
      version: v0.30.0
      kubectl_version: v1.31.4
      verbosity: 3
      wait: 120s
```

## Step 3: Install Node.js

```yaml
  - name: Set up Node.js
    uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
    with:
      node-version: 22.12.0
```

## Step 4: Install Solo CLI
Install the Solo CLI globally using npm.
Always pin the version to avoid unexpected workflow failures caused by breaking changes in newer CLI releases.

```yaml
  - name: Install Solo CLI
    run: |
      set -euo pipefail
      npm install -g @hashgraph/solo@0.48.0
      solo --version
      kind --version
```

## Step 5: Deploy Solo
Deploy a Solo network to your Kind cluster.
This creates and configures a fully functional local Hedera network including consensus node, mirror node, mirror node explorer and JSON RPC Relay.

```yaml
  - name: Deploy Solo
    env:
      SOLO_CLUSTER_NAME: solo
      SOLO_NAMESPACE: solo
      SOLO_CLUSTER_SETUP_NAMESPACE: solo-cluster
      SOLO_DEPLOYMENT: solo-deployment
    run: |
      set -euo pipefail
      kind create cluster -n "${SOLO_CLUSTER_NAME}"
      solo one-shot single deploy | tee solo-deploy.log
```

## Complete Example Workflow

Here’s the full workflow combining all the steps above:

```yaml

  - name: Check Docker Resources
    run: |
      read cpus mem <<<"$(docker info --format '{{.NCPU}} {{.MemTotal}}')"
      mem_gb=$(awk -v m="$mem" 'BEGIN{printf "%.1f", m/1000000000}')
      echo "CPU cores: $cpus"
      echo "Memory: ${mem_gb} GB"
      
  - name: Setup Kind
    uses: helm/kind-action@a1b0e391336a6ee6713a0583f8c6240d70863de3
    with:
      install_only: true
      node_image: kindest/node:v1.34.0@sha256:7416a61b42b1662ca6ca89f02028ac133a309a2a30ba309614e8ec94d976dc5a
      version: v0.30.0
      kubectl_version: v1.31.4
      verbosity: 3
      wait: 120s
         
  - name: Set up Node.js
    uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
    with:
      node-version: 22.12.0
      
  - name: Install Solo CLI
    run: |
      set -euo pipefail
      npm install -g @hashgraph/solo@0.48.0
      solo --version
      kind --version
      
  - name: Deploy Solo
    env:
      SOLO_CLUSTER_NAME: solo
      SOLO_NAMESPACE: solo
      SOLO_CLUSTER_SETUP_NAMESPACE: solo-cluster
      SOLO_DEPLOYMENT: solo-deployment
    run: |
      set -euo pipefail
      kind create cluster -n "${SOLO_CLUSTER_NAME}"
      solo one-shot single deploy | tee solo-deploy.log
```
