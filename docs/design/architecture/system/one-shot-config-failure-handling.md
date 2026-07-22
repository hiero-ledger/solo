# Config & Leftover-Artifact Failure Map (one-shot as worked example)

> **How to read this doc.** This is the **failure map / catalog** — the first of three linked docs that
> go *map → decisions → design*:
>
> 1. **This doc** — *where* things break. Every failure gets a scenario ID (`SC-*`), a `file:line`, and a
>    legend symbol. Use it to locate a failure and jump to the code.
> 2. [`config-cluster-artifacts-relationships.md`](./config-cluster-artifacts-relationships.md) — the
>    *relationship/drift view* (mermaid + plain text): the same `SC-*` failures organized by the seam
>    between local config, remote config, cluster, and artifacts, with checks-we-have vs checks-we-miss.
> 3. [`config-decision-flows.md`](./config-decision-flows.md) — the *goals + decision flowcharts* that
>    become the implementation.
>
> A fourth doc, [`config-leftover-failure-questionnaire.md`](./config-leftover-failure-questionnaire.md),
> is the per-scenario decision worksheet — **deferred for now**, kept as reference.

This document traces where Solo can fail due to **missing, corrupted, partial, or stale** local/remote
configuration and **leftover artifacts or components** from a previous run or an older Solo version. It uses
the `one-shot single` commands (`deploy`, `destroy`, `show deployment`/info) as the worked example because
they orchestrate almost every other command (deployment, cluster, node, network, block, mirror, relay,
explorer) — but the decision points generalize to all Solo commands.

It is a **map for a design decision**, not an implementation. Each failure carries a scenario ID
(`SC-*`) that maps 1:1 to the [scenario catalog](#scenario-catalog) below and to a decision block in
[`config-leftover-failure-questionnaire.md`](./config-leftover-failure-questionnaire.md). The agreed
**goals** and the proposed **local/remote config check-order flow charts** live in
[`config-decision-flows.md`](./config-decision-flows.md).

Legend: ✅ acceptable today · 🐛 bug · 🔇 silent-swallow / proceeds on bad state · ♻️ orphan / leftover ·
🔀 cross-version · ⚠️ mislabeled / untyped error.

## Contents

- [1. Shared entry spine](#1-shared-entry-spine)
- [2. Deploy pipeline](#2-one-shot-single-deploy-pipeline)
- [3. Destroy & Info](#3-one-shot-single-destroy--show-deployment)
- [4. Generalized config/leftover decision points](#4-generalized-configleftover-decision-points-all-commands)
- [5. Scenario catalog](#scenario-catalog)

## 1. Shared entry spine

Runs for every command. Local config is created/loaded in the `initSystemFiles` middleware *before* any
command handler.

```mermaid
flowchart TD
  A["solo.ts → index.ts main()"] --> B["Container.init (DI graph)"]
  B --> C["ArgumentProcessor.process → yargs parseAsync"]
  C --> D["middleware: processArgumentsAndDisplayHeader → configManager.update"]
  D --> E["middleware: initSystemFiles → localConfig.load()"]
  E --> LC{"local-config.yaml?"}
  LC -->|missing| LC1["SC-LC-1 ✅ auto-create empty"]
  LC -->|"malformed / empty / unreadable"| LC2["SC-LC-2 ✅ RefreshLocalConfigSource SOLO-1003"]
  LC -->|"parses but partial"| LC3["SC-LC-3 🔇 loads as empty → DeploymentNotFound later"]
  LC -->|"legacy ~/.solo/cache path"| LC4["SC-LC-4 ⚠️ migrate: corrupt-copy / unwrapped fs / blind delete"]
  LC -->|"schemaVersion > known"| VER["SC-VER-1 🔀🔇 passed through (see §4)"]
  LC -->|ok| F["CommandBuilder handler → installDependencies"]
  LC1 --> F
  F -->|"deploy: createCluster=true"| F
  F --> OP{"one-shot single op"}
  OP -->|deploy| DEP["§2 Deploy pipeline"]
  OP -->|destroy| DES["§3 Destroy"]
  OP -->|"show deployment"| INF["§3 Info"]
```

## 2. one-shot single deploy pipeline

Deploy first **snapshots** existing state and (interactively) auto-cleans it, then walks the sub-command
chain. The snapshot is the highest-impact silent-corruption path.

```mermaid
flowchart TD
  S0["Initialize: defaults deployment/ns/clusterRef = 'one-shot'"] --> S1["buildDeploymentStateSnapshot"]
  S1 -->|"remoteConfig.load / helm.list throw"| SNAP["SC-SNAP-1 🔇 catch → 'fresh deploy' (corrupt cfg deployed over)"]
  S1 --> S2{"pre-existing one-shot state?"}
  S2 -->|"yes + interactive"| S3["confirm → auto-destroy → rebuild"]
  S2 -->|"yes + --force/--quiet"| S4["SC-DES-3 ⚠️ ConfirmationRequired (cannot self-heal)"]
  S2 -->|no| S5
  S3 --> S5["acquire deployment lock"]
  S5 -->|"lease held by other host / crashed run"| LK["SC-LOCK-1/2 (see §4)"]
  S5 --> STEP["sub-command chain (sequential)"]

  subgraph STEP_CHAIN["Deploy sub-command chain — already-exists / partial / corrupt"]
    T1["cluster-ref connect → idempotent overwrite"]
    T2["deployment create → SC-STEP-1 self-heals stale local cfg; DeploymentAlreadyExists on race"]
    T3["deployment attach → ClusterReferenceAlreadyExists (inconsistent w/ siblings)"]
    T4["cluster-ref setup → charts idempotent; SC-HELM-2 installed-but-not-ready skipped"]
    T5["keys generate → SC-KEY-1 always overwrite, no partial detect, no validate"]
    T6["remote-config components created REQUESTED → persist"]
    T7["network/consensus deploy → uninstall+reinstall; SC-HELM-1 version drift ignored"]
    T8["block/mirror/explorer/relay add → SC-HELM-1 upgrade+install; readiness re-checked"]
    T9["create accounts → localConfig.load + remoteConfig.loadAndValidate → SC-COMP-* validator (§4)"]
    T1 --> T2 --> T3 --> T4 --> T5 --> T6 --> T7 --> T8 --> T9
  end

  STEP --> STEP_CHAIN
  STEP_CHAIN -->|"any step throws"| RB["performRollback (default --rollback=false) → partial state left"]
```

## 3. one-shot single destroy & show deployment

```mermaid
flowchart TD
  D0["Initialize: localConfig.load()"] --> D1{"deployments in local cfg?"}
  D1 -->|"none / not found"| DSK["skipAll → no-op ✅"]
  D1 -->|yes| D2["loadRemoteConfigOrWarn"]
  D2 -->|"remote load fails"| D3["assume components gone → skip per-component destroy"]
  D2 -->|"cluster unreachable"| D4["skipClusterCleanup → clean LOCAL only"]
  D3 --> DORPH["SC-DES-1 ♻️ cluster resources orphaned, only warned"]
  D4 --> DORPH
  D2 -->|ok| D5["teardown components → cluster reset → deployment delete"]
  D5 -->|"cluster reset"| DCL["SC-CL-2 🐛 uninstallPodMonitorRole deletes shared ClusterRole"]
  D5 -->|"partial failure"| DPART["SC-DES-2 ♻️ allSettled warn+continue; ns/PVC/secret kept"]
  D5 -->|"foreign/unlabeled ns"| DNS["SC-NS-1/2 🐛♻️ TypeError or skip → orphans"]

  I0["Info: resolve deployment (flag → cache file → local cfg)"] --> I1["localConfig.load → cluster connectivity"]
  I1 --> I2["read solo-remote-config ConfigMap directly"]
  I2 -->|"missing / unreachable"| I3["yellow warn + return in task ✅"]
  I2 --> I4["Display info"]
  I3 --> I4
  I4 --> IBUG["SC-INFO-1 🐛 reads remoteConfig.versions before null-guard → crash"]
```

## 4. Generalized config/leftover decision points (all commands)

These checkpoints are shared by every command that loads config or touches cluster/Helm state — the same
decisions apply well beyond one-shot.

```mermaid
flowchart TD
  RC["remoteConfig.loadAndValidate"] --> RC0{"ConfigMap present?"}
  RC0 -->|"404"| RCA["SC-RC-1 ✅ ResourceNotFound"]
  RC0 -->|"cluster unreachable / non-404"| RCB["SC-RC-2 🐛 KubernetesApiInvalidResponse (cause dropped)"]
  RC0 -->|"data corrupt / key missing / empty"| RCC["SC-RC-3/4/5 ⚠️ StorageBackendError (no code / misleading msg)"]
  RC0 -->|present| SV{"schemaVersion vs known?"}
  SV -->|"older"| SV1["migrate ✅"]
  SV -->|"newer"| SV2["SC-VER-1 🔀🔇 passed through (guard is dead code)"]
  SV -->|"unknown component type"| SV3["SC-VER-4 🔀 RemoteConfigUnsupportedComponent"]
  SV1 --> VAL["RemoteConfigValidator.validateComponents"]
  SV2 --> VAL
  VAL --> VAL1["SC-COMP-1 🔇 pod-existence only → crashing pods pass"]
  VAL --> VAL2["SC-COMP-2 ⚠️ STOPPED non-consensus w/ no pods → throws"]
  VAL --> VAL3["SC-COMP-3 ⚠️ DataValidationError ownership=Solo (really user/cluster drift)"]
  VAL --> VAL4["SC-COMP-5 🐛 changePhase/remove throw ComponentNotFound on partial state"]

  H["chart operation"] --> H1["SC-HELM-1 🔀🔇 isChartInstalled name-only → version/values drift ignored"]
  H --> H2["SC-HELM-2 🔇 installed-but-not-ready skipped"]
  H --> H3["SC-HELM-3 ♻️ legacy-named release orphaned"]

  CL["cluster-scoped / shared resources"] --> CL1["SC-CL-1 🔀 presence-only reuse, any version"]
  CL --> CL2["SC-CL-2 🐛♻️ reset deletes shared ClusterRole"]

  LKB["lease acquire"] --> LK1["SC-LOCK-1 stale lease: break on expiry / same-host dead PID; cross-host blocks"]
  LKB --> LK2["SC-LOCK-2 ⚠️ corrupt holderIdentity JSON → raw error escapes"]

  ART["cached artifacts on disk"] --> AR1["SC-CACHE-1 🔇♻️ image .tar existence-only, failures swallowed"]
  ART --> AR3["SC-CACHE-3 🔇 values files stale/partial used"]
  ART --> AR4["SC-CACHE-4 🔀🔇 staging dirs copied forward blindly"]
  ART --> AR6["SC-CACHE-6 🔇 cached package reused w/o checksum re-verify"]
  ART --> KEY["SC-KEY-2 ⚠️ corrupt PEM → raw fs/x509 error"]
```

## Scenario catalog

Every ID here has a node above and a decision block in the questionnaire.

| ID | Area | Now | Where (`file:line`) | Current behavior |
| --- | --- | --- | --- | --- |
| SC-ENTRY-1 | bootstrap | ⚠️ | `file-storage-backend.ts:31` | `~/.solo` missing at DI construct → raw `StorageBackendError` |
| SC-LC-1 | local cfg | ✅ | `local-config-runtime-state.ts:77` | missing → auto-create empty |
| SC-LC-2 | local cfg | ✅ | `local-config-runtime-state.ts:85` | malformed/empty/unreadable → `RefreshLocalConfigSource` (SOLO-1003) |
| SC-LC-3 | local cfg | 🔇 | `local-config.ts:24-40,58` | parseable-but-partial → silently empty → `DeploymentNotFound` later |
| SC-LC-4 | local cfg | ⚠️ | `local-config-runtime-state.ts:62-74` | legacy-path migration: corrupt copy / unwrapped fs / blind delete |
| SC-LC-5 | local cfg | 🐛 | (no supported command) | SRE with no local config cannot generate one from an existing cloud cluster — flow broken |
| SC-RC-1 | remote cfg | ✅ | `remote-config-runtime-state.ts:331` | ConfigMap 404 → `ResourceNotFound` (SOLO-5001) |
| SC-RC-2 | remote cfg | 🐛 | `remote-config-runtime-state.ts:329` | unreachable/non-404 → SOLO-5061, original cause dropped |
| SC-RC-3 | remote cfg | ⚠️ | `yaml-config-map-storage-backend.ts:25` | corrupt `remote-config-data` YAML → raw `StorageBackendError`, no code |
| SC-RC-4 | remote cfg | ⚠️ | `config-map-storage-backend.ts:66` | data present, key missing → misleading "error reading config map" |
| SC-RC-5 | remote cfg | ⚠️ | `yaml-config-map-storage-backend.ts:21` | empty-string value → `StorageBackendError('data is empty')` |
| SC-VER-1 | cross-version | 🔀🔇 | `schema-definition-base.ts:80-91` | schemaVersion newer than known → silently passed through; guard is dead code |
| SC-VER-2 | cross-version | ✅ | `upgrade-version-guard.ts:7` | downgrade attempt → `VersionDowngradeBlocked` (SOLO-4040) |
| SC-VER-3 | cross-version | 🔀 | `remote-config-runtime-state.ts:226` | schema created at v6, migrations to v8, `SCHEMA_VERSION` const=1 — reconcile |
| SC-VER-4 | cross-version | 🔀 | `remote-config-runtime-state.ts:481` | unknown component type → `RemoteConfigUnsupportedComponent` (SOLO-9008) |
| SC-KEY-1 | keys | 🔇 | `key-manager.ts:469-541` | `keys generate` always overwrites, no partial detect, no validate |
| SC-KEY-2 | keys | ⚠️ | `key-manager.ts:221-274` | corrupt/missing PEM on load → raw fs/x509 error, no `SoloError` |
| SC-CACHE-1 | cache | 🔇♻️ | `image-cache-handler.ts:83-127` | image `.tar` existence-only; corrupt loaded blindly; failures swallowed |
| SC-CACHE-2 | cache | 🔀 | `file-system-cache-catalog-store.ts:30` | catalog `soloVersion` unused; reuse-by-`name:version` is correct — non-issue |
| SC-CACHE-3 | cache | 🔇 | `deploy-orchestrator.ts:208,302,877` | `SOLO_VALUES_DIR` values files stale/partial used unvalidated |
| SC-CACHE-4 | cache | 🔀🔇 | `local-config-runtime-state.ts:97-125` | version staging dirs copied forward `cpSync force`, trusted |
| SC-CACHE-5 | cache | 🔇 | `deploy-orchestrator.ts:899-945` | `accounts.json` existence-only signal; contents unvalidated |
| SC-CACHE-6 | cache | 🔇 | `package-downloader.ts:243` | cached package reused by existence, no checksum re-verify |
| SC-CACHE-7 | cache | ⚠️ | `default-one-shot.ts:374` | `last-one-shot-deployment.txt` stale name used as-is |
| SC-LOCK-1 | lock | ✅⚠️ | `interval-lock.ts:137-190` | stale lease broken on expiry/same-host dead PID; cross-host blocks (no `--force-unlock`) |
| SC-LOCK-2 | lock | ⚠️ | `lock-holder.ts:194` | corrupt `holderIdentity` JSON → raw error escapes acquire/release |
| SC-HELM-1 | helm | 🔀🔇 | `chart-manager.ts:133,165` | `isChartInstalled` name-only → version/values drift ignored on install |
| SC-HELM-2 | helm | 🔇 | `chart-manager.ts:120-164` | installed-but-not-ready skipped; broken release persists |
| SC-HELM-3 | helm | ♻️ | `chart-manager.ts:165` | differently-named legacy release neither reused nor uninstalled |
| SC-HELM-4 | helm | ⚠️ | `chart-manager.ts:87-102` | repo URL mismatch only logged |
| SC-CL-1 | cluster shared | 🔀 | `cluster/tasks.ts`, `network.ts:1134`, `explorer.ts:315` | shared cluster-scoped resources reused by presence, any version |
| SC-CL-2 | cluster shared | 🐛♻️ | `cluster/tasks.ts:400` | `uninstallPodMonitorRole` unconditionally deletes shared ClusterRole |
| SC-COMP-1 | component | 🔇 | `remote-config-validator.ts:120-175` | validator checks pod existence only → crashing pods pass |
| SC-COMP-2 | component | ⚠️ | `remote-config-validator.ts:42-52` | `STOPPED` non-consensus w/ no pods → throws |
| SC-COMP-3 | component | ⚠️ | `remote-config-validator.ts:178` | `DataValidationError` ownership=Solo though real cause is drift |
| SC-COMP-4 | component | 🔇 | `remote-config-runtime-state.ts:748` | `getComponentPhasesMap` uses MIN phase → one lagging comp drags type |
| SC-COMP-5 | component | 🐛 | `components-data-wrapper.ts:86,104` | changePhase/remove throw `ComponentNotFound` on partial state |
| SC-COMP-6 | component | 🔇 | orchestrator `:536-624` | interrupted deploy leaves comps at `REQUESTED` (validator ignores) |
| SC-NS-1 | namespace | 🐛 | `k8-helper.ts:71` | `isNamespaceOwnedBySolo` no null-guard → `TypeError` on label-less ns |
| SC-NS-2 | namespace | ♻️ | `default-one-shot.ts:239`, `network.ts:1022` | foreign/unlabeled ns skipped on destroy → orphans |
| SC-DES-1 | destroy | ♻️ | `one-shot-destroy-orchestrator.ts:340-372` | unreachable/unloadable → local-only clean, cluster orphaned (warn only) |
| SC-DES-2 | destroy | ♻️ | `network.ts:1074` | partial destroy warn+continue; ns/PVC/secret kept unless flags+owned |
| SC-DES-3 | destroy | ⚠️ | `deploy-orchestrator.ts:366` | deploy over pre-existing state under `--force`/`--quiet` refuses |
| SC-SNAP-1 | snapshot | 🔇 | `deploy-orchestrator.ts:918-945` | snapshot swallows corrupt remote cfg → deploys over it as "fresh" |
| SC-INFO-1 | info | 🐛 | `default-one-shot.ts:527` | reads `remoteConfig.versions` before null-guard → crash |
| SC-STEP-1 | step policy | ⚠️ | `deployment.ts:874` | `deployment attach` throws already-exists while siblings are idempotent |
| SC-RAW-1 | error hygiene | ⚠️ | `network.ts:1211`, `explorer.ts:277` | raw `throw new Error` on-path (CRD download, cert-manager) |
