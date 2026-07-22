# Config checks to add — simplified

Checklist of the checks that need to be **added** so local & remote config errors are all addressed.
Each item lists **ADD** (what to add), **TODAY** (what happens without it), **Files** (clickable links to
where the change goes), and **TODO / DECISION** (the open choices). Full detail + evidence in
[`config-cluster-artifacts-relationships.md`](./config-cluster-artifacts-relationships.md).

Guiding rule for all of these: invalid contents are **pruned + WARN logged** (no dated backups); only
truly unrecoverable input fails fast.

## Local config

- ☐ **1. Top-level keys present**
  - **ADD:** after YAML parses, verify `deployments` / `clusterRefs` / `userIdentity` exist; missing or partial → prune-to-valid + WARN (or fail-fast).
  - **TODAY:** silently coalesces to empty; only fails much later as `DeploymentNotFound`.
  - **Files:** [local-config-runtime-state.ts:81 (load)](../../../../src/business/runtime-state/config/local/local-config-runtime-state.ts#L81) · [local-config-schema.ts:47-51 (defaults that hide it)](../../../../src/data/schema/model/local/local-config-schema.ts#L47-L51) · [local-config.ts:26-39 (facade re-coalesce)](../../../../src/business/runtime-state/config/local/local-config.ts#L26-L39) · [schema-definition-base.ts:18-31 (transform, no validation)](../../../../src/data/schema/migration/api/schema-definition-base.ts#L18-L31)
  - **TODO:** add a required-keys check after `source.refresh()` in `load()`.
  - **DECISION:** prune-to-valid + WARN, or fail-fast? (leaning prune + WARN) · which keys count as "required"?

- ☐ **2. Referential integrity**
  - **ADD:** every `deployment.clusters` entry must be a key in `clusterRefs`, and each `clusterRef` must map to a context that exists in kubeconfig; dangling references → prune + WARN.
  - **TODAY:** no check; a broken mapping surfaces as a confusing downstream error.
  - **Files:** [local-config-runtime-state.ts:81 (load, after #1)](../../../../src/business/runtime-state/config/local/local-config-runtime-state.ts#L81) · [deployment-schema.ts (deployment.clusters)](../../../../src/data/schema/model/local/deployment-schema.ts) · [local-config-schema.ts:36 (clusterRefs)](../../../../src/data/schema/model/local/local-config-schema.ts#L36) · [remote-config-runtime-state.ts:366 (resolve pattern)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L366)
  - **TODO:** cross-check `deployment.clusters` ⊆ `clusterRefs` keys; verify context in kubeconfig.
  - **DECISION:** prune the dangling entry or fail-fast? · is "context missing from kubeconfig" a prune case or warn-only?

- ☐ **3. Schema version too new (shared with remote)**
  - **ADD:** if `schemaVersion` is newer than this Solo knows → fail-fast ("created by a newer Solo, upgrade or remove").
  - **TODAY:** passed through unvalidated; the guard error class does not exist.
  - **Files:** [schema-definition-base.ts:80-91 (applyMigrations no-ops)](../../../../src/data/schema/migration/api/schema-definition-base.ts#L80-L91) · [invalid-schema-version-error.ts (existing sibling error)](../../../../src/data/schema/migration/api/invalid-schema-version-error.ts) · _(new) `SchemaVersionTooNewError` under `src/core/errors/classes/…`_
  - **TODO:** after `applyMigrations`, assert the result reached the current `SCHEMA_VERSION`; else throw.
  - **DECISION:** confirm fail-fast (no auto-downgrade) · implement once in the shared base for local + remote.

- ☐ **4. Schema version constant fix**
  - **ADD:** make `SCHEMA_VERSION` match the latest migration target.
  - **TODAY:** local const = 1 but latest migration = 2; remote const = 1 but migrations go to 8 — fresh configs written at a stale version.
  - **Files:** [local-config-schema.ts:12 (SCHEMA_VERSION = 1)](../../../../src/data/schema/model/local/local-config-schema.ts#L12) · [local-config-schema-definition.ts:36-38 (latest = 2)](../../../../src/data/schema/migration/impl/local/local-config-schema-definition.ts#L36-L38) · [remote-config-schema.ts:14 (SCHEMA_VERSION = 1)](../../../../src/data/schema/model/remote/remote-config-schema.ts#L14) · [remote-config-schema-definition.ts:42-53 (latest = 8)](../../../../src/data/schema/migration/impl/remote/remote-config-schema-definition.ts#L42-L53)
  - **TODO:** reconcile to a single source of truth (derive the const from the migration list, or assert they match at startup).
  - **DECISION:** derive vs assert. **Note:** prerequisite for #3 — the "too new" guard is meaningless until the const is correct.

- ☐ **5. SRE bootstrap (regenerate local config from the cluster)**
  - **ADD:** a supported command to rebuild local config (deployment, namespace, `clusterRef`→context) from an existing cluster's remote config.
  - **TODAY:** no such command; the flow is broken.
  - **Files:** [deployment-command-definition.ts:39 (desc says "import", no subcommand)](../../../../src/commands/command-definitions/deployment-command-definition.ts#L39) · [remote-config-runtime-state.ts:350-371 (reads remote→memory only)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L350-L371) · [cluster/tasks.ts:104 (clusterRef→context write pattern to reuse)](../../../../src/commands/cluster/tasks.ts#L104)
  - **TODO:** add e.g. `solo deployment config import --deployment <name> --context <ctx>` that reconstructs local config from the remote ConfigMap + kube context, then `persist()`.
  - **DECISION:** command name/shape and flags. **Action:** file a ticket (SC-LC-5) — confirm none exists.

## Remote config

- ☐ **6. Corrupt vs absent (deploy snapshot)**
  - **ADD:** distinguish "ConfigMap not found" from "ConfigMap load failed"; corrupt/unreachable must NOT be treated as a fresh deploy.
  - **TODAY:** both look like "fresh" → can rebuild over a real, broken deployment.
  - **Files:** [default-one-shot-deploy-orchestrator.ts:918-952 (buildDeploymentStateSnapshot)](../../../../src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.ts#L918-L952) · [remote-config-runtime-state.ts:315-338 (getConfigMap)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L315-L338)
  - **TODO:** only treat `ResourceNotFound` as "fresh"; on any other load failure, stop and surface it.
  - **DECISION:** fail-fast vs prompt/`--force` to continue over a corrupt deployment?

- ☐ **7. Coded remote-config error family**
  - **ADD:** corrupt / empty / missing-key ConfigMap data → typed `SoloError` with remediation (inspect / recreate the ConfigMap).
  - **TODAY:** raw `StorageBackendError`, no SOLO code, no guidance.
  - **Files:** [yaml-config-map-storage-backend.ts:18,22,28 (missing/empty/parse)](../../../../src/data/backend/impl/yaml-config-map-storage-backend.ts#L18) · [config-map-storage-backend.ts:64,69 (empty map / missing key)](../../../../src/data/backend/impl/config-map-storage-backend.ts#L64) · [remote-config-runtime-state.ts:340 (wrap at load)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L340) · _(new) `RemoteConfigCorruptError` family under `src/core/errors/classes/…`_
  - **TODO:** wrap the `StorageBackendError`(s) in a coded remote-config error with remediation.
  - **DECISION:** one error code for the family, or distinct codes per case (corrupt / empty / missing-key)?

- ☐ **8. Preserve the original cause**
  - **ADD:** when the cluster is unreachable / non-404, chain the underlying kube error as the `cause` on SOLO-5061.
  - **TODAY:** original cause is dropped; logs don't show the real reason.
  - **Files:** [kubernetes-api-invalid-response-solo-error.ts:16-26 (ctor takes no cause)](../../../../src/core/errors/classes/system/kubernetes-api-invalid-response-solo-error.ts#L16-L26) · [remote-config-runtime-state.ts:329 (throw site drops it)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L329)
  - **TODO:** add a `cause` parameter to the error constructor and pass the original error at the throw site.
  - **DECISION:** none — pure improvement (root-cause preservation).

- ☐ **9. Schema version too new (remote)** — same guard as #3, applied to remote config.
  - **Files:** [schema-definition-base.ts:80-91 (shared base)](../../../../src/data/schema/migration/api/schema-definition-base.ts#L80-L91) · [remote-config-schema-definition.ts:42-53](../../../../src/data/schema/migration/impl/remote/remote-config-schema-definition.ts#L42-L53)
  - **TODO:** covered by #3 if the guard lives in the shared base; verify the remote path uses it.

- ☐ **10. Component health, not just existence (drift C)**
  - **ADD:** validation asserts pods are ready/healthy, not merely present.
  - **TODAY:** pod-existence only; a CrashLoopBackOff pod passes validation.
  - **Files:** [remote-config-validator.ts:166-170 (pods.length === 0 only)](../../../../src/core/config/remote/remote-config-validator.ts#L166-L170)
  - **TODO:** check pod readiness/phase, not just count.
  - **DECISION:** fail-fast on unhealthy, or warn+continue? (health checks can be slow/flaky in CI)

- ☐ **11. Reverse reconciliation (drift B)**
  - **ADD:** detect cluster resources / helm releases that are NOT in the config.
  - **TODAY:** never detected; only config-says-it-exists is checked.
  - **Files:** [remote-config-validator.ts:107-173 (only iterates recorded components)](../../../../src/core/config/remote/remote-config-validator.ts#L107-L173) · [chart-manager.ts:166 (isChartInstalled, name-only)](../../../../src/core/chart-manager.ts#L166)
  - **TODO:** list live pods/helm releases and diff against the recorded inventory.
  - **DECISION (direction):** adopt-into-config / warn / ignore for an unrecorded cluster resource?

- ☐ **12. Reclassify drift ownership (drift A)**
  - **ADD:** config-has-it / cluster-missing-it → user/cluster-drift error with drift remediation.
  - **TODAY:** `DataValidationError` labeled as a Solo bug ("file a bug").
  - **Files:** [remote-config-validator.ts:185-196 (buildValidationError)](../../../../src/core/config/remote/remote-config-validator.ts#L185-L196) · [data-validation-error.ts:18 (ownership = Solo)](../../../../src/core/errors/classes/internal/data-validation-error.ts#L18)
  - **TODO:** use a drift-oriented error (ownership = User/Infrastructure) and pass the underlying error as `cause` (today it's passed as the `found` arg).
  - **DECISION:** heal (prune the entry) / warn+continue / fail-fast with drift remediation?

- ☐ **13. STOPPED non-consensus components**
  - **ADD:** skip the pod requirement for STOPPED relay/mirror/explorer/block, same as consensus already does.
  - **TODAY:** only consensus STOPPED is skipped; others throw when pods are absent.
  - **Files:** [remote-config-validator.ts:40-52 (skip callbacks)](../../../../src/core/config/remote/remote-config-validator.ts#L40-L52) · [remote-config-validator.ts:54-100 (per-group mapping)](../../../../src/core/config/remote/remote-config-validator.ts#L54-L100)
  - **TODO:** apply the STOPPED-skip to all component groups (not just consensus).
  - **DECISION:** confirm the exact skip set per phase (REQUESTED + STOPPED for all?).

- ☐ **14. Cross-cluster config comparison**
  - **ADD:** compare remote configs across a deployment's clusters for drift.
  - **TODAY:** only one context is read; a TODO in code acknowledges this is unimplemented.
  - **Files:** [remote-config-runtime-state.ts:395 (// TODO: Compare configs from clusterReferences)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L395)
  - **TODO:** load remote config from every context in the deployment and reconcile.
  - **DECISION:** which cluster is authoritative on mismatch? heal / warn / fail?

## Open decision (applies to all of the above)

- ☐ **When does the prune/validate step run?**
  - on every load (single choke point), or on write/persist only, or on an explicit `prune` maintenance command.
  - **Files:** [local-config-runtime-state.ts (load / persist)](../../../../src/business/runtime-state/config/local/local-config-runtime-state.ts#L81) · [remote-config-runtime-state.ts:381 (loadAndValidate)](../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.ts#L381)
  - **TODO:** pick the choke point before implementing #1, #2, #10–#12 (they all hang off it).
