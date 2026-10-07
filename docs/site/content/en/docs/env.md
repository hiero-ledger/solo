# Environment Variables

## NETWORK\_NODE\_LIFECYCLE\_MODE

Selects how Solo starts, stops and restarts the consensus node process inside the `root-container`.

* **Accepted values:** `solo-container` (default) or `consensus-node-image`
* **`solo-container`:** the solo-containers `debian-s6-java25` image, controlled through `/command/network-node-lifecycle`.
* **`consensus-node-image`:** the hiero-consensus-node deterministic image, whose single s6 `consensus` service is controlled with
  `s6-svc` (`-o` to start, `-d` to stop). Solo also sets `AUTO_START_CONSENSUS_SERVICE=false` on the root container so the node
  is not started before Solo has staged its configuration and build.
* **Used in:** `src/core/network-node-lifecycle.ts`, `src/core/helm-values-helper.ts`, `src/commands/network.ts`, `src/commands/node/tasks.ts`
