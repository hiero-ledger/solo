# Multi-Cluster No-Consensus-Cluster Example

Deploys a multi-cluster deployment where only cluster 1 runs a consensus node and cluster 2 is attached
with **zero** consensus nodes, hosting only a block node and a mirror node
(see [issue #3310](https://github.com/hiero-ledger/solo/issues/3310)).

## What It Does

- Creates two Kind clusters (with MetalLB)
- Attaches cluster 1 with one consensus node and cluster 2 with `--num-consensus-nodes 0`
- Adds a block node and a mirror node to **each** cluster. `block-node-1` is `node1`'s primary
  (`priority 1`); `block-node-2` in cluster 2 is `node1`'s secondary (`priority 2`)
- Verifies that cluster 2 is in the remote config with no consensus node pods, that every component pod is
  Ready, and reports whether `node1` can resolve the cluster 2 block node

## Prerequisites

- [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [kubectl](https://kubernetes.io/docs/tasks/tools/),
  [kind](https://kind.sigs.k8s.io/), [Helm](https://helm.sh/), Docker

## How to Use

```sh
task            # deploy and verify
task destroy    # clean up
```

## Files

- `Taskfile.yml` — deploy, verify and destroy tasks
- `kind-cluster-*.yaml`, `metallb-cluster-*.yaml` — the same two-cluster Kind and MetalLB setup used by
  `multicluster-component-image`
- `mirror-memory-values.yaml` — memory limits above Solo's defaults for this deployment only

## Notes

- The deploy fails at `deployment cluster attach` for cluster 2 until zero consensus nodes are supported
  (issue #3310).
- Solo does not configure cross-cluster DNS. `node1`'s `block-nodes.json` addresses `block-node-2` by its
  service FQDN, which only resolves from cluster 1 if the clusters can resolve each other's service names.
  The verify task reports this as a warning rather than a failure.
- The cluster 2 mirror node imports from the block node, because the bucket lives in cluster 1.
