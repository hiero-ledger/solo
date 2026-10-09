# Environment Variables

## NETWORK\_NODE\_LIFECYCLE\_MODE

Selects how Solo starts, stops and restarts the consensus node process inside the `root-container`.

* **Accepted values:** `solo-container` (default) or `consensus-node-image`
* **`solo-container`:** (default, unchanged behaviour) the solo-containers `debian-s6-java25` image, controlled through `/command/network-node-lifecycle`.
* **`consensus-node-image`:** (opt-in) the hiero-consensus-node deterministic image, whose single s6 `consensus` service is controlled with
  `s6-svc` (`-o` to start, `-d` to stop). Solo also sets `AUTO_START_CONSENSUS_SERVICE=false` on the root container so the node
  is not started before Solo has staged its configuration and build.
  The root container image is also replaced with the released consensus node image
  `gcr.io/hedera-registry/consensus-node:<release tag without the v prefix>` through the generated profile values file, together with `defaults.volumeClaims.appJarsInImage: true` so the chart does not
  mount empty `data/lib` and `data/apps` volumes over the jar files baked into the image (requires a solo-charts version that
  supports `appJarsInImage`).
  Because that image already contains the platform jar files, the "Fetch platform software" step is skipped (unless a
  `--local-build-path` is given or a version upgrade is requested).
* **Used in:** `src/core/network-node-lifecycle.ts`, `src/core/helm-values-helper.ts`, `src/core/profile-manager.ts`, `src/commands/network.ts`, `src/commands/node/tasks.ts`
