---
title: "Using 'Task' to Launch Solo"
weight: 40
description: >
    This page describes how to use the Task tool to quickly deploy a standalone Hiero Consensus Node network using Solo CLI.
    It provides a simple command-line interface for developers to set up and manage their Solo network.
type: docs
---

## Use the Task tool to Launch Solo

For developers who want to quickly deploy a standalone Hiero Consensus Node network without needing to know what is under the hood,
they can use the Task tool to launch the network with a single command.

NOTE: this requires cloning the GitHub repository: <https://github.com/hiero-ledger/solo>

First, install the cluster tool `kind` with this [link](https://kind.sigs.k8s.io/docs/user/quick-start#installation)

Then, install the task tool `task` with this [link](https://taskfile.dev/installation/)

`task` will install dependencies and build the solo project.

### Start the Hiero Consensus Node network

Developer can use one of the following three commands to quickly deploy a standalone Hiero Consensus Node network.

```bash
# Option 1) deploy the network with two nodes `task` is the same as `task default`
task

# Option 2) deploy the network with two nodes, and a Mirror Node
cd scripts
task default-with-mirror

# Option 3) deploy the network with two nodes, a Mirror Node, and a JSON RPC Relay
cd scripts
task default-with-relay
```

If a Mirror Node or a Relay node is deployed, the user can access the Hiero Explorer at <http://localhost:8080>

### Stop the Consensus Node network

To tear down the network:

```bash
task clean
```
