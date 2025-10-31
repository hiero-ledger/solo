# The usage of examples in Solo

## Table of Contents

| Example Directory                                         | Description                                                                                                         |
|-----------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| [address-book](./address-book/)                           | Example of using Yahcli to pull the ledger and mirror node address book                                             |
| [backup-restore-workflow](./backup-restore-workflow/)     | Complete backup/restore workflow: backup entire network, destroy cluster, redeploy, and restore from backup        |
| [custom-network-config](./custom-network-config/)         | Deploy a Solo network with custom configuration settings (log4j2, properties, etc.)                                 |
| [external-database-test](./external-database-test/)       | Deploy a Solo network with an external PostgreSQL database                                                          |
| [network-with-block-node](./network-with-block-node/)     | Deploy a Solo network that includes a block node                                                                    |
| [network-with-domain-names](./network-with-domain-names/) | Setup a network using custom domain names for all components                                                        |
| [node-create-transaction](./node-create-transaction/)     | Manually write a NodeCreateTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [node-delete-transaction](./node-delete-transaction/)     | Manually write a NodeDeleteTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [node-update-transaction](./node-update-transaction/)     | Manually write a NodeUpdateTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [running-solo-inside-cluster](./running-solo-inside-cluster/) | Example showing how to run Solo inside a Kubernetes cluster                                                         |
| [state-save-and-restore](./state-save-and-restore/)       | Save network state, recreate network, and restore state with mirror node (with optional external database)         |

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
