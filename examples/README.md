# The usage of examples in Solo

## Table of Contents

| Example Directory                                                   | Description                                                                                                         |
|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| [address-book](./address-book/)                                     | Example of using Yahcli to pull the ledger and mirror node address book                                             |
| [backup-restore-workflow](./backup-restore-workflow/)               | Complete backup/restore workflow using `config ops backup/restore` commands                                         |
| [custom-network-config](./custom-network-config/)                   | Deploy a Solo network with custom configuration settings (log4j2, properties, etc.)                                 |
| [external-database-test](./external-database-test/)                 | Deploy a Solo network with an external PostgreSQL database                                                          |
| [hardhat-with-solo](./hardhat-with-solo/)                           | Example of using Hardhat to test a smart contract with a local Solo deployment                                      |
| [local-build-with-custom-config](./local-build-with-custom-config/) | Example of how to create and manage a custom Hiero Hashgraph Solo deployment using locally built consensus nodes    |
| [network-with-block-node](./network-with-block-node/)               | Deploy a Solo network that includes a block node                                                                    |
| [network-with-domain-names](./network-with-domain-names/)           | Setup a network using custom domain names for all components                                                        |
| [node-create-transaction](./node-create-transaction/)               | Manually write a NodeCreateTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [node-delete-transaction](./node-delete-transaction/)               | Manually write a NodeDeleteTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [node-update-transaction](./node-update-transaction/)               | Manually write a NodeUpdateTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [one-shot-falcon](./one-shot-falcon/)                               | Example of how to use the Solo **one-shot falcon** commands                                                         |
| [rapid-fire](./rapid-fire/)                                         | Example of how to use the Solo **rapid-fire** commands                                                              |
| [running-solo-inside-cluster](./running-solo-inside-cluster/)       | Example showing how to run Solo inside a Kubernetes cluster                                                         |
| [state-save-and-restore](./state-save-and-restore/)                 | Save network state, recreate network, and restore state with mirror node (with optional external database)          |
| [version-upgrade-test](./version-upgrade-test/)                     | Example of how to upgrade all components of a Hedera network to current versions                                    |

## Prerequisites

* install taskfile: `npm install -g @go-task/cli`

## Running the examples with Taskfile

* `cd` into the directory under `examples` that has the `Taskfile.yml`, e.g. (from solo repo root directory) `cd examples/network-with-block-node/`
* make sure that your current kubeconfig context is pointing to the cluster that you want to deploy to
* run `task` which will do the rest and deploy the network and take care of many of the pre-requisites

NOTES:

* Some of these examples are for running against large clusters with a lot of resources available.
* Edit the values of the variables as needed.

## Customizing the examples

* take a look at the Taskfile.yml sitting in the subdirectory for the deployment you want to run
* make sure your cluster can handle the number in SOLO\_NETWORK\_SIZE, if not, then you will have to update that and make it match the number of nodes in the `init-containers-values.yaml`: `hedera.nodes[]`
* take a look at the `init-containers-values.yaml` file and make sure the values are correct for your deployment with special attention to:
  * resources
  * nodeSelector
  * tolerations
