# Idempotent One-Shot Commands

| | |
|---|---|
| **Status** | Draft — proposed |
| **Author** | Boris Bonin |
| **Tracking issue** | TBD (umbrella issue) |
| **Affects** | `src/commands/one-shot/`, `src/commands/command-helpers.ts`, remote config schema |
| **Phase 1 scope** | Binding |
| **Phase 2 / 3 scope** | Stated direction, deferred to follow-up RFCs |

## 1. Context

`solo one-shot single deploy` and `solo one-shot falcon deploy` orchestrate a full Hiero network deployment by sequentially invoking ~15 sub-commands through `deployInternal()` in `src/commands/one-shot/default-one-shot.ts`. The flow today has three properties that make operator life difficult:

1. **No resume.** If any step fails midway, the operator must either accept the partial state and manually clean it up, or re-deploy from scratch. There is no first-class "continue from where you stopped" path. Wasted time per re-attempt: 10–25 minutes.
2. **No safe re-run.** Several steps throw on existing state — notably `deployment config create` (`DeploymentAlreadyExistsSoloError`) and the remote-config component creation step. Invoking deploy twice on the same configuration is an error, not a no-op.
3. **No convergence.** There is no command that compares desired state (the user's flags / values file) to actual cluster state and brings them into agreement.

Solo *already has* substantial state-tracking infrastructure that could power idempotent behavior — it's just not consulted by the one-shot flow. This RFC proposes a three-phase roadmap that builds on the existing state model rather than introducing a parallel one, with Phase 1 (command-level guards) as the binding deliverable.

## 2. Goals

- A failed one-shot deploy can be re-invoked with the same flags and resume from the failed step, not from step 1.
- A successful one-shot deploy can be re-invoked with the same flags and complete as a fast no-op.
- Steps that currently throw on existing state instead detect the existing state and skip.
- The existing "preserve state on failure" default — currently undocumented and contradicted by the flag's describe text — is made explicit and properly documented.

## 3. Non-Goals

- Detecting **unhealthy-but-installed** resources (e.g., pods in `CrashLoopBackOff` will be treated as installed → skipped). Deferred to Phase 3.
- Detecting **configuration drift** — guards check existence, not whether the deployed thing matches the user's current flags. Deferred to Phase 3.
- Explicit **resume UX** (`--resume`, `solo one-shot resume`). Phase 1 is implicit: re-running `deploy` is the resume mechanism. A first-class resume command is deferred to Phase 2.
- Persisting per-step **workflow state** beyond what `ComponentsDataWrapper` already gives us. Deferred to Phase 2.

## 4. Existing Infrastructure

The work below leans on the following pieces already in the codebase. Paths are accurate at time of writing.

| Asset | Location | What it provides |
|---|---|---|
| `DeploymentPhase` enum | `src/data/schema/model/remote/deployment-phase.ts` | `REQUESTED → DEPLOYED → CONFIGURED → STARTED → STOPPED → FROZEN` |
| `LedgerPhase` enum | `src/data/schema/model/remote/ledger-phase.ts` | `UNINITIALIZED → INITIALIZED → SNAPSHOT_RESTORING/RESTORED → RECOVERING/RECOVERED → FREEZING → …`. Phase 1 only depends on `INITIALIZED`-or-not. |
| `ComponentsDataWrapper` | `src/core/config/remote/components-data-wrapper.ts` | `changeComponentPhase(componentId, type, phase)`, `getComponentByType<T>(type): T[]` |
| `RemoteConfigRuntimeState` | `src/business/runtime-state/config/remote/remote-config-runtime-state.ts` | ConfigMap read entry point (`k8Factory.getK8(context).configMaps().read(namespace, name)`); the natural caller for the snapshot pre-fetch task |
| `validateAllNodePhases()` | `src/commands/node/handlers.ts` | Phase-gated execution for node operations |
| `ChartManager.isChartInstalled()` | `src/core/chart-manager.ts` | Helm release existence check |
| `invokeSoloCommand()` skip callback | `src/commands/command-helpers.ts` | Synchronous `skipCallback?: () => boolean` hook per sub-command |
| `performRollback()` + `--rollback` flag | `src/commands/one-shot/default-one-shot.ts` | Currently opt-in rollback (default off); see §6.4 |
| Destroy graceful degradation | `src/commands/one-shot/default-one-shot.ts` (destroy flow) | `config.skipAll = true` when resources are missing |
| `DiagnosticsAnalyzer` | `src/commands/util/diagnostics-analyzer.ts` | Failure categorization (image-pull, OOM, pod-readiness, etc.) |

The takeaway: phase enums and per-component state exist; chart, ConfigMap, and remote-config existence checks exist; a skip hook on `invokeSoloCommand()` exists. The missing piece is *consulting those signals in the one-shot flow*.

## 5. Approach Overview

Three phases, each delivering operator-visible value on its own:

- **Phase 1 — Crawl: Command-Level Guards.** Before any step runs, pre-fetch a snapshot of "what already exists" and attach it to the task context. Each sub-command invocation gets a skip predicate that reads the snapshot. Steps that today throw on existing state are made idempotent.
- **Phase 2 — Walk: Workflow State + Resume.** Persist per-step workflow state to the remote ConfigMap so resume decisions can survive across Solo upgrades, distinguish "in progress" from "completed", and surface a clean resume UX.
- **Phase 3 — Run: Convergence + Health.** Replace existence-only guards with health-aware ones, detect configuration drift, and integrate `DiagnosticsAnalyzer` so re-runs can recover from broken state rather than skipping over it.

Phase 1 is sufficient to address the most common operator complaint (re-running after failure) without depending on schema changes or new commands. Phases 2 and 3 each warrant their own RFC once Phase 1 is in production and producing failure data.

## 6. Phase 1 Design (Binding)

### 6.1 The guard mechanism

The `invokeSoloCommand()` skip callback signature is synchronous (`() => boolean`), but the natural guard checks (Helm release lookup, ConfigMap fetch, remote-config phase read) are async. Resolution: pre-fetch *all* guard signals in a new task early in `deployInternal()` and attach them to the task context as a typed `DeploymentStateSnapshot`. Skip callbacks then read from the snapshot synchronously.

```typescript
interface DeploymentStateSnapshot {
  localConfig: {
    deploymentExists: boolean;
    clusterRefs: Set<string>;
  };
  remoteConfig: {
    configMapExists: boolean;
    componentPhases: Map<ComponentType, DeploymentPhase>;
  };
  helm: {
    installedReleases: Set<string>; // per cluster
  };
  keys: {
    consensusKeysOnDisk: boolean;
  };
  accounts: {
    accountsFileExists: boolean;  // ${outputDirectory}/accounts.json
  };
}
```

The snapshot is fetched once, near the top of `deployInternal()`, and is treated as immutable for the rest of the run. Long-running deploys could in principle race against the snapshot, but Phase 1 accepts that risk: a step that the snapshot believed was incomplete will simply run and rely on its own idempotency (helm install, ConfigMap PATCH, etc.) to no-op if the state has changed underneath. Tighter freshness is a Phase 3 concern.

### 6.2 New task: "Check existing deployment state"

Inserted after `Initialize` and before any `invokeSoloCommand()` call:

```
Initialize
└─ Check existing deployment state    ← new
   ├─ Query local config
   ├─ Query K8s for remote ConfigMap (via RemoteConfigRuntimeState)
   ├─ Query Helm for chart releases
   ├─ Read component phases from remote config (if it exists)
   ├─ Check consensus key files on disk
   └─ Check accounts.json on disk
```

All guard signals are local (filesystem) or in-cluster metadata (Helm releases, ConfigMaps). No ledger round-trip is required, which keeps the snapshot fast even on cold environments.

Failures inside this task are non-fatal: a missing K8s context, missing ConfigMap, or unreachable cluster are all valid "fresh deploy" signals. The snapshot returns conservative `false`/`empty` values, and the deploy proceeds as if from scratch.

### 6.3 Guard classification

Each `invokeSoloCommand()` in `deployInternal()` receives a skip callback derived from the snapshot. The table maps each step to its detection signal and notes what changes vs. today.

| Step | Sub-command | Guard signal | Change |
|---|---|---|---|
| 5 | `cluster-ref config connect` | `localConfig.clusterRefs.has(clusterRef)` | Adds explicit guard. `Map.set` is already effectively idempotent, but the guard avoids the no-op call. |
| 6 | `deployment config create` | `localConfig.deploymentExists && remoteConfig.configMapExists` | **Behavior change.** Currently throws `DeploymentAlreadyExistsSoloError`. New behavior: skip. See §6.5. |
| 7 | `deployment cluster attach` | (already idempotent) | None — logs and continues on existing attachment. |
| 8 | `cluster-ref config setup` | `helm.installedReleases.has(clusterChartName)` | Adds guard. Helm install is internally idempotent, but the guard avoids the round-trip. |
| 9 | `keys consensus generate` | `keys.consensusKeysOnDisk` | Adds guard. Keys are per-deployment in `${cacheDir}/keys/`, so safe to skip on match. |
| 10 | Create remote-config components | `remoteConfig.componentPhases.size > 0` | **Behavior change.** Currently throws on existing component. New: skip. See §6.5. |
| 11a | `block add` | `componentPhases.get(BLOCK_NODE) >= DEPLOYED` | Adds guard (existing skip is for the feature flag, not for re-runs). |
| 11b | `consensus deploy` | `componentPhases.get(CONSENSUS_NODE) >= DEPLOYED` ∨ Helm release exists | Adds guard. |
| 11c | `consensus setup` | `componentPhases.get(CONSENSUS_NODE) >= CONFIGURED` | Adds guard at one-shot level. The node handler already validates phase but does not short-circuit at the orchestration layer. |
| 11d | `consensus start` | `componentPhases.get(CONSENSUS_NODE) >= STARTED` | Adds guard at one-shot level. |
| 11e | Account creation | `accounts.accountsFileExists` (i.e., `${outputDirectory}/accounts.json` is present) | Adds an all-or-nothing local-file guard. The account-creation step already writes this file at completion (see `default-one-shot.ts` accounts step). Partial-completion handling deferred to Phase 2. |
| 11f | `mirror add` | `componentPhases.get(MIRROR_NODE) >= DEPLOYED` | Adds guard (existing skip is for the feature flag). |
| 11g | `explorer add` | `componentPhases.get(EXPLORER) >= DEPLOYED` | Adds guard (existing skip is for the feature flag). |
| 11h | `relay add` | `componentPhases.get(RELAY) >= DEPLOYED` | Adds guard (existing skip is for the feature flag). |

Logging: every guard that fires emits a one-line `INFO` log at the one-shot level: `Step 'X' skipped: already at phase Y`. This is the operator's primary signal that resume happened.

### 6.4 Rollback default — clarify, don't flip

Today's behavior is already what an idempotency-aware design wants:

```typescript
public static readonly rollback: CommandFlag = {
  constName: 'rollback',
  name: 'rollback',
  definition: {
    defaultValue: false,  // rollback is OFF by default
    ...
  },
};
```

And `performRollback()` short-circuits on `config.rollback === false`, leaving partial state in place. **However**, the flag's describe text contradicts the default — it tells users "Use `--no-rollback` to skip cleanup", implying rollback is the default when it is not. This has surely confused users (and confused the author of this RFC's planning doc).

Phase 1 changes:

- **No behavior change to the default.** Rollback stays opt-in. Re-running deploy after a failure already finds partial state intact and resumes from there once the Phase 1 guards land.
- **Fix the describe text** in `src/commands/flags.ts` to accurately state: "Automatically clean up partial resources when deploy fails. Default: off (partial state is preserved so deploy can be re-run as a resume)."
- **Update operator-facing docs** (`docs/site/content/en/docs/`) to document the resume workflow: "If `solo one-shot deploy` fails, fix the underlying issue and re-run the same command — Phase 1 guards will skip completed steps."
- **No flag removal or deprecation** is needed. `--no-rollback` was an undocumented synonym for the existing default; we are not renaming or removing flags.

This was the most impactful correction to the original planning doc; see §15 Notes for context.

### 6.5 Idempotent throws

Two sites currently throw on existing state. The fix is local to those handlers, not in the one-shot flow:

- **`deployment config create`** — when the deployment already exists in both local config and the remote ConfigMap, log `Deployment 'X' already exists, skipping creation` and return successfully instead of throwing `DeploymentAlreadyExistsSoloError`. If only one of the two sides exists (stale state), retain the current cleanup-and-proceed behavior already implemented for that case.
- **Remote-config component creation** — when a component of the requested type already exists in the components array, log and return successfully instead of throwing. The phase-gated guards on later steps already handle the "skip subsequent work" decision.

These two changes also make the operations safe to call directly (not just from one-shot), which is a small bonus for scripted workflows.

## 7. Phase 2 Sketch (Non-Binding)

Persist per-step workflow state to enable real resume UX and observability:

```typescript
interface WorkflowStep {
  id: string;            // 'cluster-connect', 'deployment-create', …
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
```

Open design questions, all deferred to a Phase 2 RFC:

- Storage: extend the existing remote ConfigMap vs. a dedicated workflow ConfigMap.
- Schema versioning across Solo upgrades — how do we read a workflow record written by an older Solo?
- UX: auto-resume on detect vs. prompt vs. explicit `--resume` flag vs. a `solo one-shot resume` command.
- Partial-completion handling: account creation that finished 18 of 30 accounts, e.g.

## 8. Phase 3 Sketch (Non-Binding)

Desired-state vs. actual-state reconciliation:

- A `solo one-shot status` command that reports per-component health against the deployment's desired configuration.
- Health-aware guards: replace "chart installed → skip" with "chart installed AND healthy → skip". Unhealthy resources become a recovery target, not a skip.
- Config drift detection: compare the deployed component versions against the user's current `--release-tag` and friends.
- Integration with `DiagnosticsAnalyzer` so a re-run after failure can fix the root cause (image pull error → retry pull; OOM → adjust resources; etc.) rather than skip past it.

Open questions for a Phase 3 RFC: implicit convergence in `deploy` vs. an explicit `converge` command; version upgrade strategy; how aggressive drift correction should be by default.

## 9. Edge Cases (Phase 1)

| Case | Phase 1 behavior |
|---|---|
| Deployment in local config but not in cluster (stale) | `deployment create` already handles this — cleans stale config, proceeds. |
| Remote config exists but components in wrong phase | Snapshot reads actual phase; phase-gated guards run incomplete steps and skip complete ones. |
| Helm release exists but pods `CrashLoopBackOff` | Guard sees "installed" → skips. **Not handled** in Phase 1; addressed in Phase 3. |
| Keys exist but for a different deployment | Safe — keys are stored per-deployment under `${cacheDir}/keys/`. |
| Accounts partially created (e.g., crashed mid-batch) | All-or-nothing — `accounts.json` is only written on completion, so partial state will re-run the entire batch. Tighter handling deferred to Phase 2. |
| User changes flags between runs | **Not detected** in Phase 1. Guards check existence, not correctness. Addressed in Phase 3. |
| K8s context unreachable during snapshot | Treat as "fresh" — snapshot returns empty/false; deploy proceeds and the failing step surfaces the real error. |

## 10. Verification

The Phase 1 implementation lands a dedicated E2E suite under `test/e2e/commands/one-shot-idempotency.test.ts` exercising four scenarios:

1. **Fresh deploy.** No prior state. No guards fire. Behavior identical to today.
2. **Re-run after full success.** All guards fire. Every `invokeSoloCommand()` is skipped. Command completes in seconds.
3. **Re-run after failure at consensus setup.** Steps 1–9 are skipped; setup resumes; subsequent steps run normally.
4. **Re-run after failure at mirror add.** Consensus stays up; mirror deploys; explorer + relay + accounts complete normally.

Scenarios 3 and 4 require a way to inject failure midway through a deploy. The mechanism is an internal env var (`SOLO_FAIL_AFTER_STEP=<step-id>`) consumed only by the test build and rejected at startup in production builds. Design of this mechanism is in scope for the infrastructure work item (§11 issue 1).

## 11. Implementation Plan

Implementation lands as ~9 PRs, each issue-sized:

1. `DeploymentStateSnapshot` types, pre-fetch task (consuming `RemoteConfigRuntimeState`), plus the test-only failure-injection hook.
2. Make `deployment config create` idempotent.
3. Make remote-config component creation idempotent.
4. Guards for cluster-ref / cluster-ref setup / keys (steps 5, 8, 9).
5. Guards for consensus deploy / setup / start (steps 11b–d).
6. Guards for block / mirror / explorer / relay add (steps 11a, f–h).
7. Account creation guard (step 11e), using the existing `accounts.json` file.
8. Fix `--rollback` describe text + add operator-facing resume documentation (no behavior change).
9. E2E re-run scenarios (§10).

Ordering matters: PR 1 is a prerequisite for everything else. PRs 2–8 are independent of each other and can be reviewed in parallel. PR 9 should land last so the test suite reflects final behavior.

## 12. Risks

- **Snapshot staleness on long deploys.** A deploy that runs for 20 minutes may make decisions based on a 20-minute-old snapshot. Mitigation accepted for Phase 1: subordinate steps' own idempotency catches the race. Tighter freshness in Phase 3.
- **Guard false-negatives mask real bugs.** A guard that incorrectly says "already done" causes a silent skip. Mitigation: every guard fire logs a one-liner at `INFO`; the test suite asserts exact skip/run sequences for the four scenarios in §10.
- **Idempotent throws change error semantics.** Operators who *expected* `DeploymentAlreadyExistsSoloError` as a signal lose that signal. Mitigation: log clearly; document in changelog; the new behavior is what most operators want when invoking deploy a second time.
- **Documentation-only flag change still surprises users.** Some users may have relied on the misleading describe text and believed rollback was default-on; their existing scripts may have been explicitly passing `--no-rollback` to "preserve state" — which was a no-op against the real default. Mitigation: the documentation update explicitly calls out the previously-misleading describe text in the changelog.

## 13. Rollout

- Phase 1 ships behind no feature flag — the new guard behavior is the only behavior.
- The `--rollback` flag retains its current name, default, and semantics; only the describe text and external docs change.
- No data migration is required; the snapshot is read-only.
- Changelog entry under "Behavior changes (UX)" calls out: (a) re-running `deploy` after a failure now resumes from the failed step rather than erroring on existing state, (b) `--rollback`'s describe text has been corrected to match its long-standing default.

## 14. Open Questions

- Should guards emit a structured event (in addition to the log line) so external tooling can detect "step X was skipped"?
- Is the `SOLO_FAIL_AFTER_STEP` injection mechanism acceptable, or should the test suite use a different approach (e.g., a test-only subclass)?

## 15. References & Notes

- Solo source: `src/commands/one-shot/default-one-shot.ts`, `src/commands/command-helpers.ts` (`invokeSoloCommand`), `src/data/schema/model/remote/deployment-phase.ts`, `src/core/config/remote/components-data-wrapper.ts`, `src/business/runtime-state/config/remote/remote-config-runtime-state.ts`.
- Related plan: `docs/plans/parallelize-one-shot-plan.md` — parallelization of one-shot. Orthogonal but overlaps in the same `deployInternal()` flow; the snapshot mechanism here is compatible with parallel execution.
- Umbrella tracking issue: TBD.

**Note on the planning-to-RFC delta.** Two corrections were applied to the planning doc that produced this RFC:

- The planning doc proposed flipping the rollback default. Verification against `main` showed the default is already off; the flag's describe text was the actual source of confusion. §6.4 was rewritten to reflect this.
- The planning doc proposed guarding the account-creation step on the existence of ledger account `0.0.1002`. No such literal exists in the codebase. The account-creation step already writes `${outputDirectory}/accounts.json` on success, which is a faster and more reliable signal. §6.3 step 11e was changed accordingly.
