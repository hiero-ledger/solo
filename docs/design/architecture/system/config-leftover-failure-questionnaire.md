# Config & Leftover-Artifact Failure — Decision Questionnaire

> **How to read this doc.** This is the **decision worksheet** — one fill-in block per scenario (`SC-*`) to
> turn the failure map into agreed decisions (*handle it? behavior? owner? priority?*). It is the third
> step in the *map → decisions → design* chain:
> [`one-shot-config-failure-handling.md`](./one-shot-config-failure-handling.md) (where things break) →
> [`config-cluster-artifacts-relationships.md`](./config-cluster-artifacts-relationships.md) (relationship/
> drift view, checks we have vs miss) → **this worksheet** →
> [`config-decision-flows.md`](./config-decision-flows.md) (the design that gets built).
>
> **Status: deferred for now.** Per current direction the team is focusing on the flowcharts and the
> relationship/drift analysis first; this worksheet is kept as reference and is not being actively filled.

Companion to [`one-shot-config-failure-handling.md`](./one-shot-config-failure-handling.md). One block per
scenario (`SC-*`). The purpose is to force an explicit decision for each case **before** any code is
written: *do we want to handle it, and if so, how?* Fill the checkboxes in review; the "Suggested starting
point" is a non-binding prompt to speed discussion, not a decision.

**How to answer each block**

- **Do we want to handle it?** `Yes` / `No (accept as-is)` / `Defer`. 
- **Desired behavior** (if Yes): `fail-fast` (clear actionable error) · `auto-heal` (recreate/repair) ·
  `warn + continue` · `prompt / require --force` · `other`.
- **Ownership:** `User` · `Infrastructure` · `Solo bug`.
- **Priority:** `P0` (blocks/data-loss) · `P1` · `P2` · `P3`.
- **Acceptance criteria:** the observable behavior / test that proves it's handled.

Blocks are grouped by area (A–N), matching the catalog. Proposed check-order flow charts and the agreed
goals are in [`config-decision-flows.md`](./config-decision-flows.md).

## Agreed goals & guiding principles

These frame the individual decisions below.

- **General:** capture hard-to-implement ideas anyway and sequence later; this is a collaborative starting
  point, not a finished design; prefer a single validation choke point; errors should be typed + actionable.
- **Local config:** contain only valid contents; **prune** invalid contents (do not preserve); emit **WARN**
  logs on prune/repair; **no dated backups** (maintenance burden — rely on warn logs + remote config as the
  recoverable source of truth); decide **when** prune runs (see decision-flows doc).
- **Remote config:** contain only valid contents; decide **what to do when the live topology doesn't match**
  the remote config (heal / warn / fail), per direction of drift (DRIFT-A/B/C in the decision-flows doc).

---

## A. Entry / bootstrap

### SC-ENTRY-1 — `~/.solo` directory missing at DI construction - YES
- **Where:** `file-storage-backend.ts:31` (constructor `lstatSync`s `basePath`).
- **Trigger:** first run / wiped home dir; a service that resolves `LocalConfigRuntimeState` before `initSystemFiles` created `~/.solo`.
- **Current behavior:** ⚠️ raw `StorageBackendError('basePath must exist')` at container-resolve time, before any friendly load path.
- **Impact:** low frequency, but an opaque early crash with no remediation.
- **Applies to:** all commands.
- **Suggested starting point:** ensure `~/.solo` is created during `Container.init`/bootstrap before the backend is constructed (fail-fast only if creation fails).
- **DECISIONS:**
  - Handle it? ☐ Yes ☐ No ☐ Defer
  - Desired behavior: ☐ fail-fast ☐ auto-heal (mkdir) ☐ warn+continue ☐ prompt/force ☐ other: ____
  - Ownership: ☐ User ☐ Infrastructure ☐ Solo bug
  - Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3
  - Acceptance criteria: ____
  - Open questions: ____
  - Investigate if valid and fix if it is

---

## B. Local config (`~/.solo/local-config.yaml`)

### SC-LC-1 — Missing local config
- **Where:** `local-config-runtime-state.ts:77`.
- **Trigger:** fresh machine / deleted file.
- **Current behavior:** ✅ auto-creates an empty config, no error.
- **Impact:** none — intended.
- **Applies to:** all commands.
- **Suggested starting point:** No (accept as-is).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Keep as it is


### SC-LC-2 — Malformed / empty / unreadable local config
- **Where:** `local-config-runtime-state.ts:85`.
- **Trigger:** hand-edit, disk corruption, truncated write.
- **Current behavior:** ✅ `RefreshLocalConfigSourceError` (SOLO-1003) with remediation.
- **Impact:** low — clear error.
- **Applies to:** all commands.
- **Suggested starting point:** No (accept as-is); optionally ensure the message names the file path.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: leverage the command that will generate the local config based on an existing remote config

### SC-LC-3 — Parseable-but-partial local config (missing `deployments`/`clusterRefs`)
- **Where:** `local-config.ts:24-40,58`.
- **Trigger:** interrupted write, older/hand-trimmed file that still parses.
- **Current behavior:** 🔇 fields null-coalesce to empty → loads as a valid-but-empty config; only surfaces later as `DeploymentNotFound`.
- **Impact:** medium — confusing downstream error instead of "your config is incomplete".
- **Applies to:** all commands.
- **Suggested starting point:** fail-fast with a clear "local config is incomplete/corrupt" error when required top-level keys are absent.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: make sure we are creating the local config atomically or leverage the command from above

### SC-LC-4 — Legacy `~/.solo/cache/local-config.yaml` migration edge cases
- **Where:** `local-config-runtime-state.ts:62-74`.
- **Trigger:** upgrading from a Solo version that stored config under `cache/`.
- **Current behavior:** ⚠️ corrupt old file is copied to the new path then fails to parse; `fs` copy/rm errors are unwrapped; old file deleted unconditionally with no content compare.
- **Impact:** medium — an upgrade can propagate corruption or lose the old file.
- **Applies to:** all commands (first load after upgrade).
- **Suggested starting point:** validate old file parses before copying; wrap fs ops; prune-to-valid + WARN instead of blind-delete (no dated backup, per the local-config principle).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: move first -> perform validations and fallback logic - make sure that logic is not skipped because of ordering 

### SC-LC-5 — SRE with no local config bootstraps from an existing cloud cluster
- **Where:** no supported command today (would read the remote-config ConfigMap + kube context).
- **Trigger:** a Hashsphere SRE with a clean machine needs to work against an existing Solo network in a cloud cluster.
- **Current behavior:** 🐛 **broken** — there is no documented/supported way to regenerate local config (deployment, namespace, clusterRef→context mapping) from the cluster.
- **Impact:** high for operators — blocks a core SRE workflow.
- **Applies to:** all commands (bootstrap precondition).
- **Suggested starting point:** add a supported `solo deployment config import --namespace <name> --context <ctx>` that reconstructs local config from the remote config; document it. **File a ticket if one doesn't exist.**
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: optional namespace/context if missing attempt to use the default + one-shot default - otherwise prompt interactively (non-destructive), dont query non-kind clusters, accepted contexts (any non-kind, default context, solo one-shot default values for namespace and deployment)

---

## C. Remote config (`solo-remote-config` ConfigMap)

### SC-RC-1 — ConfigMap missing (404)
- **Where:** `remote-config-runtime-state.ts:331`.
- **Trigger:** deployment never created / already destroyed.
- **Current behavior:** ✅ `ResourceNotFound` (SOLO-5001).
- **Impact:** low.
- **Applies to:** deploy/destroy/validate (info tolerates separately — see SC-INFO-1).
- **Suggested starting point:** No (accept as-is).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: If we detect remote config is not found, cleaning up and starting over if is a kind cluster

### SC-RC-2 — Cluster unreachable / non-404 API error
- **Where:** `remote-config-runtime-state.ts:329`.
- **Trigger:** kube context down, RBAC denial, API server error.
- **Current behavior:** 🐛 wrapped as `KubernetesApiInvalidResponse` (SOLO-5061) but the **original cause is discarded**, so logs don't show the real reason.
- **Impact:** medium — hard to diagnose the real failure.
- **Applies to:** all commands touching remote config.
- **Suggested starting point:** preserve the original error as `cause`.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: for non-kind throw an error `ClusterUnreachableError`, for kind clusters throw `KubernetesApiInvalidResponse`
- Note: follow up feature to detect if kind container is stopped, and resume it or start docker engine

### SC-RC-3 — Corrupt / partial `remote-config-data` YAML
- **Where:** `yaml-config-map-storage-backend.ts:25`.
- **Trigger:** hand-edited ConfigMap, interrupted write by an older Solo, partial patch.
- **Current behavior:** ⚠️ raw `StorageBackendError` (no dedicated SOLO code / remediation) propagates.
- **Impact:** medium — cryptic error, no guidance.
- **Applies to:** all commands touching remote config.
- **Suggested starting point:** wrap in a coded remote-config error with remediation (inspect/recreate ConfigMap).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Capture the broken config, advice to delete the cluster, if its re-producable or the user thinks its our fault, create a pr and use the diagnostics command

### SC-RC-4 — ConfigMap present but `remote-config-data` key missing
- **Where:** `config-map-storage-backend.ts:66`.
- **Trigger:** partially-created / foreign ConfigMap with the label but no data key.
- **Current behavior:** ⚠️ `Buffer.from(undefined)` throws → rewrapped as misleading "error reading config map".
- **Impact:** low/medium — misleading message.
- **Applies to:** all commands touching remote config.
- **Suggested starting point:** distinct "missing key" message.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: add check if value and key exists before passing it to the buffer

### SC-RC-5 — ConfigMap data value is empty string
- **Where:** `yaml-config-map-storage-backend.ts:21`.
- **Trigger:** interrupted create that wrote an empty value.
- **Current behavior:** ⚠️ `StorageBackendError('data is empty for key')`.
- **Impact:** low.
- **Applies to:** all commands touching remote config.
- **Suggested starting point:** fold into the SC-RC-3 coded error family.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Capture the broken config, advice to delete the cluster, if its re-producable or the user thinks its our fault, create a pr and use the diagnostics command

---

## D. Schema / cross-version

### SC-VER-1 — Config schema version newer than this Solo knows
- **Where:** `schema-definition-base.ts:80-91`.
- **Trigger:** running an older Solo against local/remote config written by a newer Solo.
- **Current behavior:** 🔀🔇 no migration matches → data passed through unvalidated; `SchemaVersionTooNewError` exists but is **never thrown** (dead code).
- **Impact:** high — forward-incompatibility silently proceeds on data it doesn't understand.
- **Applies to:** all commands (local + remote config).
- **Suggested starting point:** fail-fast with a clear "created by a newer Solo — upgrade or remove" error (wire up the existing error class).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Recommend the user to update to newer version of solo, use Solo version older then the one currently used, report on the version used inside the remote config and the current + the config schema versions (for the report message)

### SC-VER-2 — Downgrade attempt vs deployed component version
- **Where:** `upgrade-version-guard.ts:7`.
- **Trigger:** re-running with an older target version than what's deployed.
- **Current behavior:** ✅ `VersionDowngradeBlocked` (SOLO-4040).
- **Impact:** none — intended guard.
- **Applies to:** upgrade/add flows.
- **Suggested starting point:** No (accept as-is).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: leave as it is

### SC-VER-3 — Schema version constants inconsistent (create=v6, migrations→v8, const=1)
- **Where:** `remote-config-runtime-state.ts:226`, `remote-config-schema.ts:14`.
- **Trigger:** internal inconsistency; matters for SC-VER-1's "max known version" computation.
- **Current behavior:** 🔀 `transform()` never consults the declared version, so the numbers can drift without detection.
- **Impact:** medium — undermines any forward-incompat gate; confusing for maintainers.
- **Applies to:** remote (and local) config schema.
- **Suggested starting point:** reconcile the created version / const / latest-migration to a single source of truth.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Add unit tests that validate the highest migration version is not newer then the static version

### SC-VER-4 — Unknown component type in remote config
- **Where:** `remote-config-runtime-state.ts:481`.
- **Trigger:** ConfigMap written by a newer Solo with a component type this build doesn't know, or hand-edit.
- **Current behavior:** 🔀 `RemoteConfigUnsupportedComponent` (SOLO-9008), ownership=Solo.
- **Impact:** medium — thrown, but labeled as a Solo bug though the cause is cross-version/user.
- **Applies to:** all commands loading remote config.
- **Suggested starting point:** keep the throw but reconsider ownership/message (ties to SC-VER-1).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Do same as above by reporting on current vs remote versions

---

## E. Keys on disk

### SC-KEY-1 — `keys generate` always overwrites; no partial detection or validation
- **Where:** `key-manager.ts:469-541`.
- **Trigger:** re-run over a keys dir that has some/all/corrupt node keys.
- **Current behavior:** 🔇 regenerates all keys (timestamped backup of old); no "only-missing" branch; corrupt pre-existing keys silently replaced, never validated.
- **Impact:** medium — masks a corrupt-keys situation; can churn keys unexpectedly on re-run.
- **Applies to:** deploy, node add/setup.
- **Suggested starting point:** decide desired re-run semantics (regenerate-all vs reuse-valid vs fail-on-corrupt). Note: this path currently keeps **timestamped backups** of old keys — reconcile against the "no dated backups" principle.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Already fixed

### SC-KEY-2 — Corrupt/missing PEM on load → raw error
- **Where:** `key-manager.ts:221-274`.
- **Trigger:** truncated/corrupt gossip or TLS pem from a prior partial run.
- **Current behavior:** ⚠️ raw `fs`/x509 errors, no `SoloError`, no remediation.
- **Impact:** medium — cryptic crypto errors.
- **Applies to:** node flows that load keys.
- **Suggested starting point:** wrap in a typed key error with remediation (regenerate keys).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: Wrap in a try-catch and report it with a unique error message

---

## F. Cache / values / staging / packages

### SC-CACHE-1 — Image `.tar` trusted by existence; corrupt loaded blindly; failures swallowed
- **Where:** `image-cache-handler.ts:83-127`.
- **Trigger:** truncated archive from an interrupted save/crash.
- **Current behavior:** 🔇♻️ existence-only check; load/save failures logged and skipped, deploy proceeds as if cached.
- **Impact:** medium — a broken cached image can cause confusing downstream cluster failures.
- **Applies to:** deploy (image cache/load).
- **Suggested starting point:** decide whether to validate archive integrity (size/checksum) and whether load failure should fail-fast.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
- A: TBD

### SC-CACHE-2 — Image cache reuse across Solo versions
- **Where:** `file-system-cache-catalog-store.ts:30`.
- **Trigger:** upgrading Solo with a populated image cache.
- **Current behavior:** 🔀 archives keyed by `name__version`; catalog `soloVersion`/`load()` unused → reuse across versions is correct.
- **Impact:** none — a version-gate here would be a regression (needless re-pulls / rate limits).
- **Applies to:** deploy.
- **Suggested starting point:** No (accept as-is) — documented non-issue.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-CACHE-3 — Stale/partial values files used unvalidated
- **Where:** `deploy-orchestrator.ts:208,302,877`.
- **Trigger:** leftover `SOLO_VALUES_DIR` files from a prior run/version.
- **Current behavior:** 🔇 read as raw text and concatenated into Helm values, no schema/YAML validation.
- **Impact:** medium — stale values silently shape the deploy.
- **Applies to:** deploy.
- **Suggested starting point:** decide if cached values should be validated or regenerated per run.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-CACHE-4 — Version staging dirs copied forward blindly
- **Where:** `local-config-runtime-state.ts:97-125`.
- **Trigger:** upgrade with old `vX.Y/staging/…` dirs present.
- **Current behavior:** 🔀🔇 `cpSync force` copies old staging artifacts into the current release dir, trusted; old dirs left on disk.
- **Impact:** medium — stale cross-version artifacts trusted; disk growth.
- **Applies to:** deploy/setup.
- **Suggested starting point:** decide validate-vs-ignore for forwarded staging, and whether to prune old dirs.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-CACHE-5 — `accounts.json` used as existence-only prior-state signal
- **Where:** `deploy-orchestrator.ts:899-945`.
- **Trigger:** leftover/corrupt `accounts.json` in the one-shot output dir.
- **Current behavior:** 🔇 only existence is checked; contents never parsed/validated.
- **Impact:** low/medium — a stale file influences "existing state" detection.
- **Applies to:** one-shot deploy snapshot.
- **Suggested starting point:** decide if contents should be validated or if existence is sufficient signal.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-CACHE-6 — Cached package reused without checksum re-verification
- **Where:** `package-downloader.ts:243`.
- **Trigger:** a package file left truncated by a prior crashed download.
- **Current behavior:** 🔇 when `force=false`, an existing file is trusted by existence; only fresh downloads verify checksum.
- **Impact:** medium — a corrupt cached package is used.
- **Applies to:** dependency/artifact download.
- **Suggested starting point:** re-verify checksum of an already-present file before reuse.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-CACHE-7 — Stale `last-one-shot-deployment.txt`
- **Where:** `default-one-shot.ts:374`.
- **Trigger:** cache file points at a deployment that no longer exists.
- **Current behavior:** ⚠️ used as-is; only guarded by a later lookup failure.
- **Impact:** low.
- **Applies to:** info / deployment resolution.
- **Suggested starting point:** validate the cached name against local config before using.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## G. Locks / leases (Kubernetes Lease)

### SC-LOCK-1 — Stale lease from a crashed run
- **Where:** `interval-lock.ts:137-190`.
- **Trigger:** a prior run crashed holding the namespace lease.
- **Current behavior:** ✅/⚠️ auto-broken on expiry or same-host dead PID; a cross-machine crash blocks with `LockAcquisitionError` until expiry; no `--force-unlock`.
- **Impact:** medium — CI/other-host crash can block until the lease expires.
- **Applies to:** any locked operation (deploy/destroy).
- **Suggested starting point:** decide whether to add an explicit `--force-unlock` / break-lease path and its guardrails.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-LOCK-2 — Corrupt/partial `holderIdentity` JSON
- **Where:** `lock-holder.ts:194`.
- **Trigger:** lease written by an older Solo with a different shape, or hand-edited.
- **Current behavior:** ⚠️ raw `SyntaxError`/`MissingArgumentError` escapes `acquire`/`release` (outside the try/catch).
- **Impact:** medium — opaque crash instead of a lock error.
- **Applies to:** any locked operation.
- **Suggested starting point:** treat unparseable holder identity as a breakable/foreign lease or a typed lock error.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## H. Helm / chart drift

### SC-HELM-1 — Version/values drift ignored on install (name-only match)
- **Where:** `chart-manager.ts:133,165`.
- **Trigger:** a release installed by an older Solo (different version/values) is present.
- **Current behavior:** 🔀🔇 `install` no-ops if a release with the same name exists; version/values never reconciled.
- **Impact:** high — deploy silently runs against a stale chart/values.
- **Applies to:** all chart installs (cluster setup, network, components).
- **Suggested starting point:** decide reconcile policy (compare version/values; upgrade or fail on drift).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-HELM-2 — "Installed but not ready" release skipped
- **Where:** `chart-manager.ts:120-164`.
- **Trigger:** a prior run installed a chart whose pods never became ready.
- **Current behavior:** 🔇 `isChartInstalled` true → re-install skipped; cluster setup has no readiness probe, so a broken release persists.
- **Impact:** medium/high — broken release silently kept.
- **Applies to:** cluster setup and component adds.
- **Suggested starting point:** decide whether "installed" should imply "ready", and add readiness/repair where missing.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-HELM-3 — Legacy-named release neither reused nor uninstalled
- **Where:** `chart-manager.ts:165`.
- **Trigger:** a release named under an older Solo's scheme.
- **Current behavior:** ♻️ name-only match misses it → not reused, not cleaned → orphan.
- **Impact:** medium — orphaned releases accumulate.
- **Applies to:** install/uninstall.
- **Suggested starting point:** decide detection strategy for legacy release names (labels vs name).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-HELM-4 — Repo URL mismatch only logged
- **Where:** `chart-manager.ts:87-102`.
- **Trigger:** a repo of the same name exists with a different URL.
- **Current behavior:** ⚠️ logs a debug note and proceeds (force-update dependent).
- **Impact:** low.
- **Applies to:** repo setup.
- **Suggested starting point:** decide whether a URL mismatch should warn loudly or fix.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## I. Cluster-scoped / shared resources

### SC-CL-1 — Shared cluster-scoped resources reused by presence, any version
- **Where:** `cluster/tasks.ts`, `network.ts:1134`, `explorer.ts:315`.
- **Trigger:** `pod-monitor-role` ClusterRole, cert-manager/prometheus/PodLogs CRDs, minio/metallb operators pre-existing from another deployment or older Solo.
- **Current behavior:** 🔀 presence-only checks reuse whatever version is there; no version reconcile.
- **Impact:** medium — stale/older cluster-scoped definitions silently in effect; multi-deployment coupling.
- **Applies to:** cluster setup, network, explorer.
- **Suggested starting point:** decide ownership/versioning model for shared cluster-scoped resources.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-CL-2 — `uninstallPodMonitorRole` deletes a shared ClusterRole
- **Where:** `cluster/tasks.ts:400`.
- **Trigger:** `cluster reset`/destroy while another deployment shares the cluster.
- **Current behavior:** 🐛♻️ unconditionally deletes the cluster-scoped ClusterRole (ignores existence check), errors swallowed → can break other live deployments.
- **Impact:** high — cross-deployment breakage.
- **Applies to:** cluster reset / one-shot destroy.
- **Suggested starting point:** reference-count or scope the ClusterRole per deployment, or guard deletion.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## J. Component phase / health / validator

### SC-COMP-1 — Validator checks pod existence, not health
- **Where:** `remote-config-validator.ts:120-175`.
- **Trigger:** a component recorded DEPLOYED whose pods are CrashLoopBackOff/Pending.
- **Current behavior:** 🔇 `pods.length > 0` passes → deploy proceeds on broken state.
- **Impact:** high — builds on top of a broken component.
- **Applies to:** all commands that validate remote config.
- **Suggested starting point:** decide whether validation should assert readiness/health, not just existence.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-COMP-2 — `STOPPED` non-consensus component with no pods throws
- **Where:** `remote-config-validator.ts:42-52`.
- **Trigger:** a legitimately stopped relay/mirror/explorer/blockNode whose pods were removed.
- **Current behavior:** ⚠️ only consensus `STOPPED` is skipped; others validate → throw when pods absent.
- **Impact:** medium — false failure on a valid stopped component.
- **Applies to:** commands validating remote config.
- **Suggested starting point:** decide correct skip set per phase for non-consensus components.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-COMP-3 — Drift surfaced as internal Solo bug
- **Where:** `remote-config-validator.ts:178`.
- **Trigger:** remote config references resources deleted out-of-band.
- **Current behavior:** ⚠️ `DataValidationError` ownership=Solo ("file a bug") though the real cause is user/cluster drift.
- **Impact:** medium — misleading remediation, misattributed bug reports.
- **Applies to:** commands validating remote config.
- **Suggested starting point:** reclassify ownership + message toward drift remediation.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-COMP-4 — Phase map collapses to MIN across components
- **Where:** `remote-config-runtime-state.ts:748`.
- **Trigger:** one lagging component of a type.
- **Current behavior:** 🔇 reported type phase = minimum, so one behind-component drags the whole type down.
- **Impact:** low/medium — coarse state signal.
- **Applies to:** snapshot / state reporting.
- **Suggested starting point:** decide if per-component granularity is needed for decisions.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-COMP-5 — `changeComponentPhase`/`removeComponent` throw on missing id
- **Where:** `components-data-wrapper.ts:86,104`.
- **Trigger:** a partial prior run left a component un-created that a later step expects.
- **Current behavior:** 🐛 `ComponentNotFound` thrown instead of self-heal.
- **Impact:** medium — a partial run can't be resumed/cleaned cleanly.
- **Applies to:** deploy/destroy component updates.
- **Suggested starting point:** decide tolerate-missing vs throw for these operations.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-COMP-6 — Interrupted deploy leaves components at `REQUESTED`
- **Where:** orchestrator `:536-624`.
- **Trigger:** deploy crashes after stamping `REQUESTED` components but before creating them.
- **Current behavior:** 🔇 validator ignores `REQUESTED`; consistency relies solely on ConfigMap/helm detection.
- **Impact:** medium — a half-registered deploy may look partly clean.
- **Applies to:** one-shot deploy / any component deploy.
- **Suggested starting point:** decide whether `REQUESTED`-but-never-created should be detected/cleaned.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## K. Namespace ownership / orphans

### SC-NS-1 — `isNamespaceOwnedBySolo` crashes on a label-less namespace
- **Where:** `k8-helper.ts:71`.
- **Trigger:** a namespace with no labels at all.
- **Current behavior:** 🐛 dereferences labels without a null guard → `TypeError`.
- **Impact:** medium — crash instead of a clean "not owned".
- **Applies to:** destroy paths.
- **Suggested starting point:** null-guard → treat as not-owned.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-NS-2 — Foreign/unlabeled namespace skipped on destroy → orphans
- **Where:** `default-one-shot.ts:239`, `network.ts:1022`.
- **Trigger:** deploying into a namespace Solo didn't create/label.
- **Current behavior:** ♻️ destroy skips deletion of a non-Solo-owned namespace; Solo resources inside become orphans.
- **Impact:** medium — leftover resources after destroy.
- **Applies to:** destroy.
- **Suggested starting point:** decide whether to label-on-adopt at deploy, or report orphans at destroy.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## L. Destroy / orphans

### SC-DES-1 — Destroy with unreachable cluster / unloadable remote config
- **Where:** `one-shot-destroy-orchestrator.ts:340-372`.
- **Trigger:** cluster down or remote config gone at destroy time.
- **Current behavior:** ♻️ cleans local config only; cluster resources orphaned; only a warning.
- **Impact:** medium/high — silent orphans presented as success.
- **Applies to:** destroy.
- **Suggested starting point:** report the specific resources that may remain + remediation (do not present as clean).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-DES-2 — Partial destroy warn-and-continue leaves orphans
- **Where:** `network.ts:1074`.
- **Trigger:** some teardown steps fail.
- **Current behavior:** ♻️ `allSettled` warns per step and continues; namespace/PVC/secret kept unless both delete flags set and namespace is Solo-owned.
- **Impact:** medium — scattered warnings, no consolidated "what's left".
- **Applies to:** network/one-shot destroy.
- **Suggested starting point:** aggregate + summarize orphaned resources at end.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-DES-3 — Deploy over pre-existing state under `--force`/`--quiet` refuses
- **Where:** `deploy-orchestrator.ts:366`.
- **Trigger:** non-interactive deploy with leftover one-shot state.
- **Current behavior:** ⚠️ throws `ConfirmationRequired`; cannot self-heal non-interactively.
- **Impact:** medium — automation can't recover from a prior partial deploy.
- **Applies to:** one-shot deploy.
- **Suggested starting point:** decide whether `--force` should imply auto-clean (and keep `--quiet` non-destructive).
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## M. One-shot snapshot (highest impact)

### SC-SNAP-1 — Snapshot swallows corrupt remote config → deploys over it as "fresh"
- **Where:** `deploy-orchestrator.ts:918-945`.
- **Trigger:** a real deployment whose remote ConfigMap data is corrupt.
- **Current behavior:** 🔇 `try/catch` treats load failure as "fresh deploy" → `hasExistingOneShotState` false → auto-clean may not fire → deploy runs on top of a real-but-corrupt deployment.
- **Impact:** high — potential data/deploy corruption of a live deployment.
- **Applies to:** one-shot deploy.
- **Suggested starting point:** distinguish "absent" from "present-but-corrupt"; do not treat corruption as fresh.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

---

## N. Info + step inconsistencies + error hygiene

### SC-INFO-1 — `show deployment` crashes on missing remote config
- **Where:** `default-one-shot.ts:527`.
- **Trigger:** info against a deployment whose ConfigMap is missing/unreachable.
- **Current behavior:** 🐛 reads `remoteConfig.versions` before the null-guard → `TypeError` → `InfoRetrievalFailed`.
- **Impact:** medium — info command crashes instead of degrading.
- **Applies to:** info.
- **Suggested starting point:** guard before dereference / early-return a friendly message.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-STEP-1 — Inconsistent already-exists policy across sub-commands
- **Where:** `deployment.ts:874` (attach) vs idempotent siblings.
- **Trigger:** re-running a step whose target already exists.
- **Current behavior:** ⚠️ `deployment attach` throws `ClusterReferenceAlreadyExists` while connect/setup/etc. are idempotent.
- **Impact:** low/medium — inconsistent re-run behavior.
- **Applies to:** deployment sub-commands.
- **Suggested starting point:** decide a consistent already-exists policy (idempotent vs explicit error) across steps.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____

### SC-RAW-1 — Raw `throw new Error` on active paths
- **Where:** `network.ts:1211` (CRD download), `explorer.ts:277` (cert-manager).
- **Trigger:** CRD download / cert-manager failures.
- **Current behavior:** ⚠️ untyped `Error`, no SOLO code / remediation.
- **Impact:** low/medium — inconsistent error surface.
- **Applies to:** network/explorer.
- **Suggested starting point:** convert to typed `SoloError`s with remediation.
- **DECISIONS:** Handle? ☐ Yes ☐ No ☐ Defer · Behavior: ☐ fail-fast ☐ auto-heal ☐ warn+continue ☐ prompt/force ☐ other · Ownership: ☐ User ☐ Infra ☐ Solo bug · Priority: ☐ P0 ☐ P1 ☐ P2 ☐ P3 · Acceptance: ____ · Open Qs: ____
