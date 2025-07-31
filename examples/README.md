# The usage of examples in Solo

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
