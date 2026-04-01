# Plan: Parallelize One-Shot & Falcon Deploy with Single Lease

## Context

The `solo one-shot single deploy` and `solo one-shot falcon deploy` commands orchestrate a full Hiero network deployment by sequentially invoking ~12 sub-commands (cluster-ref connect, deployment create, consensus deploy/setup/start, mirror add, explorer add, relay add, etc.). Currently, the entire flow runs strictly sequentially, and **each sub-command acquires and releases its own Kubernetes lease independently**. This means:

1. **No parallelism** -- components that could deploy concurrently (e.g., explorer + relay, or create-accounts alongside mirror) wait for each other unnecessarily.
2. **Lease churn** -- each sub-command creates, acquires, auto-renews, and releases a K8s Lease object, adding overhead.
3. **Typical deploy time: ~15-25 minutes**, with ~5-10 minutes of potential savings from parallelism.

This plan introduces a single lease held by the one-shot parent and restructures the task flow into parallel phases where dependency ordering allows.

---

## Recent Changes Affecting This Plan

Since the original analysis, the following commits have landed on `main`:

1. **`d79ed4cf` - Component deployment toggles for falcon** (`--deploy-mirror-node`, `--deploy-explorer`, `--deploy-relay` flags). Each component in one-shot falcon can now be individually disabled. Skip callbacks added to mirror add, explorer add, and relay add tasks. This **enhances** the parallelization opportunity since components are already independent.

2. **`1b4a563a` - Flag leak prevention**. `argvPushGlobalFlags()` in `command-helpers.ts` now resolves `ConfigManager` from the DI container at call time (line 38) to conditionally propagate `devMode` and `quiet` flags. This **reinforces Constraint 1** (ConfigManager singleton) — concurrent sub-commands that call `argvPushGlobalFlags()` at the same time would read from the same singleton.

3. **`7039ed22` - K8s client upgrade** from `@kubernetes/client-node` v0.22.3 to v1.4.0. All Lease API calls updated to named-parameter style. The lock/lease mechanism is functionally unchanged.

4. **`95dfa93f` - New `solo one-shot show deployment` command** (`info()` method). Read-only, no lease needed. No impact on parallelization.

5. **New `rapid-fire.ts` command** found with lease management (lines 240, 268, 296, 310, 322, 345, 363, 412). Must be added to Work Item 3 for lease guard.

6. **Destroy flow expanded** — now includes `cluster-ref reset`, `cluster-ref disconnect`, `deployment delete`, and `delete cache folder` steps in addition to the component destroys.

---

## Current Sequential Flow (both `single deploy` and `falcon deploy`)

```
 1. Initialize (config, UUID generation, deployment toggles)
 2. Check for other deployments (skip if --force/--quiet)
 3. solo cluster-ref connect
 4. solo deployment create
 5. solo deployment attach
 6. solo cluster-ref setup
 7. solo keys generate
 8. solo block add             (skipped if ONE_SHOT_WITH_BLOCK_NODE !== 'true')
 9. solo consensus deploy
10. solo consensus setup
11. solo consensus start
12. solo mirror add            (skippable via --deploy-mirror-node=false)
13. Extended setup:
    a. solo explorer add       (skippable via --deploy-explorer=false)
    b. solo relay add          (skippable via --deploy-relay=false)
    ↑ concurrent: false
14. Create accounts (30 accts, already concurrent: true internally)
15. Finish (display info, save files)
```

**File**: `src/commands/one-shot/default-one-shot.ts` (`deployInternal()`, lines 123-558)

### Current Destroy Flow

```
 1. Initialize (load config, resolve deployment/namespace)
 2. Destroy extended setup (concurrent: false):
    a. solo explorer destroy
    b. solo relay destroy
    ↑ skip if !hasExplorers || !hasRelays
 3. solo mirror destroy        (skip if no mirror nodes)
 4. solo block destroy         (skip if no block nodes or env var)
 5. solo consensus destroy     (skip if no deployment)
 6. solo cluster-ref reset     (skip if no deployment)
 7. solo cluster-ref disconnect (skip if no deployment)
 8. solo deployment delete     (skip if no deployment)
 9. Delete cache folder
10. Finish
```

**File**: `src/commands/one-shot/default-one-shot.ts` (`destroyInternal()`, lines 793-1033)

---

## Component Dependency Graph

```
Infrastructure (1-7): strictly sequential, each depends on prior step
    ↓
Block add (8): needs consensus nodes in remote config (created at step 5)
    ↓
Consensus deploy/setup/start (9-11): strictly sequential
    ↓
Mirror add (12): needs consensus running (skippable)
    ↓
Explorer add (13a) ──┐
                      ├─ both need mirror, but NOT each other (individually skippable)
Relay add (13b) ─────┘

Create accounts (14): needs consensus running, does NOT need mirror/explorer/relay
```

---

## Concurrency Constraints

### Constraint 1: ConfigManager Singleton
`ConfigManager` is a DI singleton. Each sub-command's Initialize task calls `this.configManager.update(argv)`, which **globally overwrites** flag values. Two concurrent sub-commands calling `update()` would corrupt each other's config. **Sub-commands that call configManager.update() cannot run concurrently.**

**Note**: `argvPushGlobalFlags()` (command-helpers.ts:38) now also reads from ConfigManager at call time via `container.resolve<ConfigManager>()`, adding another read-time dependency on the singleton.

### Constraint 2: RemoteConfig Singleton
`RemoteConfigRuntimeState` is a DI singleton. Its `persist()` method serializes the in-memory state to a K8s ConfigMap. It does a read-modify-write cycle. Two concurrent `persist()` calls would race (last writer wins, potentially losing the other's changes).

### Constraint 3: Create Accounts Is Safe
The "Create Accounts" task (step 14) is an **inline task** in `default-one-shot.ts` -- it does NOT call `configManager.update()` and does NOT call `remoteConfig.persist()`. It only calls `accountManager.loadNodeClient()` and `accountManager.createNewAccount()`. It is safe to run concurrently with other operations.

---

## Proposed Parallelized Flow

### Phase 1: Quick Wins (single lease + parallel accounts + parallel explorer/relay)

```
Sequential Phase A (Infrastructure):
  1. Initialize + acquire SINGLE lease
  2. Check for other deployments
  3. cluster-ref connect
  4. deployment create
  5. deployment attach
  6. cluster-ref setup
  7. keys generate

Sequential Phase B (Block + Consensus):
  8. block add (if enabled)
  9. consensus deploy
 10. consensus setup
 11. consensus start

Parallel Phase C (Components + Accounts):          ← NEW
  ┌─ Pipeline A (sequential internally):
  │    12. mirror add (if deployMirrorNode)
  │    13. Extended setup (explorer + relay, concurrent: true)  ← CHANGED
  │        ↑ respects deployExplorer / deployRelay toggles
  │
  └─ Pipeline B (concurrent with Pipeline A):
       14. create accounts

Sequential Phase D:
  15. Finish
```

**Time savings**: Create accounts (~1-2 min) runs fully in parallel with the mirror+explorer+relay pipeline (~6-13 min), saving ~1-2 minutes. Explorer + relay run concurrently with each other, saving another ~1-3 minutes.

**Total Phase 1 savings: ~2-5 minutes per deploy.**

### Phase 2: Deep Parallelism (ConfigManager isolation + RemoteConfig mutex)

```
Sequential Phase A (Infrastructure): same as Phase 1

Sequential Phase B (Consensus core):
  8. consensus deploy

Parallel Phase B2 (Block + Consensus setup):       ← NEW
  ┌─ block add (if enabled)
  └─ consensus setup

Sequential Phase B3:
  9. consensus start

Parallel Phase C (Components + Accounts):
  ┌─ Pipeline A:
  │    12. mirror add
  │    → Parallel: explorer add || relay add
  └─ Pipeline B:
       14. create accounts

Sequential Phase D: Finish
```

**Additional savings from Phase 2: ~1-3 minutes** (block add overlaps with consensus setup).

---

## Implementation Details

### Work Item 1: Add `oneShotMode` Internal Flag
**File**: `src/commands/flags.ts`

Add a hidden, internal-only boolean flag that signals sub-commands are running inside one-shot and should skip lease acquisition:

```typescript
static readonly oneShotMode: CommandFlag = {
  constName: 'oneShotMode',
  name: 'one-shot-mode',
  definition: {
    describe: 'Internal: skip lease when invoked from one-shot',
    type: 'boolean',
    defaultValue: false,
  },
  prompt: undefined,
};
```

**Estimate**: 0.5 days

---

### Work Item 2: Single Lease in One-Shot
**File**: `src/commands/one-shot/default-one-shot.ts`

Modify `deployInternal()`:
- In the Initialize task, after `this.configManager.update(argv)`, set `this.configManager.setFlag(flags.oneShotMode, true)`
- Add a new task after Initialize: **"Acquire deployment lock"** that creates and acquires a single lease
- In the `finally` block, release the lease and reset `oneShotMode` to false
- Apply the same pattern to `destroyInternal()`

```typescript
// In Initialize task (after line 135):
this.configManager.setFlag(flags.oneShotMode, true);

// New task after Initialize (after line 210):
{
  title: 'Acquire deployment lock',
  task: async (context_, task) => {
    oneShotLease = await this.leaseManager.create();
    return ListrLock.newAcquireLockTask(oneShotLease, task);
  },
},

// In finally block (replace lines 548-555):
finally {
  this.configManager.setFlag(flags.oneShotMode, false);
  const promises: Promise<void>[] = [];
  if (oneShotLease) {
    promises.push(oneShotLease.release());
  }
  promises.push(
    this.taskList.callCloseFunctions().catch((error): void => {
      this.logger.error('Error during closing task list:', error);
    })
  );
  await Promise.all(promises);
}
```

**Estimate**: 1 day

---

### Work Item 3: Guard Lease Acquisition in Sub-Commands
**Files** (8 files, ~25 locations total):
- `src/commands/block-node.ts` (5 methods: add, destroy, upgrade, addExternal, deleteExternal — lines 395, 462, 607, 644, 700, 739, 821, 861, 899, 926)
- `src/commands/mirror-node.ts` (3 methods: add, upgrade, destroy — lines 885, 1047, 1098, 1249, 1306, 1352)
- `src/commands/relay.ts` (3 methods: add, upgrade, destroy — lines 515, 574, 628, 683, 726, 764)
- `src/commands/explorer.ts` (3 methods: add, upgrade, destroy — lines 571, 620, 672, 718, 762, 796)
- `src/commands/network.ts` (2 methods: deploy, destroy — lines 986, 989, 1485, 1511)
- `src/commands/node/tasks.ts` (2 locations — lines 1155, 3402)
- `src/commands/cluster/tasks.ts` (1 location — line 426)
- `src/commands/rapid-fire.ts` (4 locations — lines 268, 296, 322, 345)

In each Initialize task, wrap lease creation:
```typescript
if (!this.configManager.getFlag(flags.oneShotMode)) {
  lease = await this.leaseManager.create();
  return ListrLock.newAcquireLockTask(lease, task);
}
```

In each `commandAction` call or `isRoot()` branch, skip lease release when in one-shot mode:
```typescript
// In registerCloseFunction / finally blocks:
if (!this.configManager.getFlag(flags.oneShotMode) && lease) {
  await lease?.release();
}
```

Also guard `src/core/command-handler.ts` lease release logic (lines 52-53, 62).

**Estimate**: 2-3 days

---

### Work Item 4: Restructure Deploy Task List for Parallelism
**File**: `src/commands/one-shot/default-one-shot.ts`

Replace the flat task array (steps 12-14) with a parallel group structure. The new deployment toggles (`deployMirrorNode`, `deployExplorer`, `deployRelay`) must be respected in the skip callbacks:

```typescript
// After consensus start (step 11), replace steps 12-14 with:
{
  title: 'Deploy components and create accounts',
  task: async (context_, task) => {
    return task.newListr([
      // Pipeline A: mirror → (explorer || relay)
      {
        title: 'Deploy mirror node and extensions',
        task: async (context_, task) => {
          return task.newListr([
            invokeSoloCommand('solo mirror add', MirrorCommandDefinition.ADD_COMMAND, ...),
            {
              title: 'Extended setup',
              skip: () => config.minimalSetup,
              task: async (context_, task) => {
                return task.newListr([
                  invokeSoloCommand('solo explorer add', ..., () => !config.deployExplorer),
                  invokeSoloCommand('solo relay add', ..., () => !config.deployRelay),
                ], { concurrent: true });  // ← Explorer + Relay in parallel
              },
            },
          ], { concurrent: false });
        },
        skip: () => !config.deployMirrorNode && config.minimalSetup,
      },
      // Pipeline B: create accounts (concurrent with Pipeline A)
      {
        title: 'Create Accounts',
        skip: () => config.predefinedAccounts === false,
        task: async (context_, task) => {
          // ... same account creation logic as current lines 463-525
        },
      },
    ], { concurrent: true });  // ← Both pipelines run concurrently
  },
},
```

**Key detail**: Explorer and relay's Initialize tasks run sequentially within the Extended Setup subtask group (Listr2 runs task function to get children, then runs children). With `concurrent: true`, both explorer's and relay's Initialize tasks would call `configManager.update()` concurrently -- BUT since explorer and relay receive different argv (different command names), and they capture their config into `context_.config` in Initialize, the ConfigManager state is only needed during Initialize. Since Listr2 resolves task functions sequentially even in concurrent mode (it awaits each task's setup function, then runs the returned subtasks concurrently), the Initialize tasks actually serialize while the heavy-lifting subtasks (Helm install, pod waiting) run concurrently.

**Important**: Verify this Listr2 behavior in testing. If Listr2 truly runs the `task:` functions concurrently (not just the returned subtasks), then explorer+relay would need to remain `concurrent: false` in Phase 1 and wait for Phase 2's ConfigManager isolation.

**Note on `argvPushGlobalFlags()`**: This function now reads from ConfigManager at call time (line 38). The callbacks that build argv (e.g., `() => { ... return argvPushGlobalFlags(argv); }`) are invoked during the task's `task()` function, so they would see the current ConfigManager state. In Phase 1, this is safe because Explorer and Relay argv are built before their concurrent Helm tasks start. In Phase 2, ConfigManager isolation would fully protect this.

**Estimate**: 2-3 days

---

### Work Item 5: Parallel Destroy Flow
**File**: `src/commands/one-shot/default-one-shot.ts`

Apply the same single-lease pattern to `destroyInternal()`:
- Acquire single lease in Initialize
- Parallelize explorer destroy + relay destroy (`concurrent: true`)
- Release lease in finally

```
Current destroy (lines 793-1033):
  init → (explorer → relay) destroy → mirror destroy → block destroy →
  consensus destroy → cluster-ref reset → cluster-ref disconnect →
  deployment delete → delete cache folder → finish

Proposed:
  init + acquire lease → (explorer || relay) destroy → mirror destroy →
  block destroy → consensus destroy → cluster-ref reset →
  cluster-ref disconnect → deployment delete → delete cache folder → finish
```

**Note**: The destroy extended setup skip logic at line 897 uses `!hasExplorers || !hasRelays` — this skips the entire group if EITHER component is missing. Consider changing to `!hasExplorers && !hasRelays` or making each destroy individually skippable (similar to the deploy toggles).

**Estimate**: 1 day

---

### Work Item 6: Unit & Integration Tests
**Files**:
- `test/e2e/commands/one-shot-single.test.ts` -- verify parallel deploy completes successfully
- Add new unit tests for `oneShotMode` flag behavior
- Add tests verifying lease is NOT acquired by sub-commands when flag is set
- Test with deployment toggles (`--deploy-mirror-node=false`, etc.) to verify parallelization works with skipped components

**Estimate**: 2-3 days

---

### Work Item 7 (Phase 2): ConfigManager Scope Isolation
**File**: `src/core/config-manager.ts`

Add snapshot/restore capability so concurrent sub-commands get isolated config views:

```typescript
public snapshot(): Map<string, any> { return new Map(this.flags); }
public restore(snapshot: Map<string, any>): void { this.flags = snapshot; }
```

**File**: `src/commands/command-helpers.ts`

Wrap `subTaskSoloCommand()` with snapshot/restore when in one-shot mode. Also ensure `argvPushGlobalFlags()` (which now reads from ConfigManager at line 38) uses the correct snapshot context when called concurrently.

**Estimate**: 2-3 days

---

### Work Item 8 (Phase 2): RemoteConfig Persist Mutex
**File**: `src/business/runtime-state/config/remote/remote-config-runtime-state.ts`

Add a simple async mutex around `persist()` to prevent concurrent ConfigMap writes:

```typescript
private persistLock: Promise<void> = Promise.resolve();

public async persist(): Promise<void> {
  const previousLock = this.persistLock;
  let releaseLock: () => void;
  this.persistLock = new Promise(resolve => { releaseLock = resolve; });
  await previousLock;
  try {
    // existing persist logic...
  } finally {
    releaseLock();
  }
}
```

This enables safe concurrent remote config modifications in Phase 2, allowing block add to overlap with consensus setup.

**Estimate**: 1-2 days

---

### Work Item 9 (Phase 2): Block Add Parallel with Consensus Setup
**File**: `src/commands/one-shot/default-one-shot.ts`

Restructure Phase B:
```typescript
// consensus deploy (sequential)
// then parallel: [block add || consensus setup]
// then consensus start (sequential)
```

**Estimate**: 2-3 days (including Phase 2 tests)

---

## Engineer Time Estimates Summary

| # | Work Item | Phase | Estimate | Risk |
|---|-----------|-------|----------|------|
| 1 | Add `oneShotMode` flag | 1 | 0.5 days | Low |
| 2 | Single lease in one-shot deploy/destroy | 1 | 1 day | Low |
| 3 | Guard lease acquisition in 8 sub-command files (~25 locations) | 1 | 2-3 days | Low |
| 4 | Restructure deploy task list for parallel phases | 1 | 2-3 days | Medium |
| 5 | Parallel destroy flow | 1 | 1 day | Low |
| 6 | Unit & integration tests | 1 | 2-3 days | Low |
| **Phase 1 Total** | | | **7-11 days** | |
| 7 | ConfigManager scope isolation | 2 | 2-3 days | Medium |
| 8 | RemoteConfig persist mutex | 2 | 1-2 days | Medium |
| 9 | Block add parallel with consensus setup + tests | 2 | 2-3 days | Medium |
| **Phase 2 Total** | | | **5-8 days** | |
| **Grand Total** | | | **12-19 days** | |

## Expected Time Savings

| Improvement | Savings | Phase |
|------------|---------|-------|
| Eliminate per-command lease acquire/release overhead | ~30s | 1 |
| Create accounts in parallel with mirror pipeline | ~1-2 min | 1 |
| Explorer + relay concurrent deployment | ~1-3 min | 1 |
| Block add overlaps with consensus setup | ~1-3 min | 2 |
| **Total savings per deploy** | **~3-8 min** | |
| **Deploy time reduction** | **~20-35%** | |

## Error Handling

- If mirror add fails, explorer/relay are **not started** (they're sequential after mirror within Pipeline A)
- If create accounts fails (Pipeline B), Pipeline A continues -- mirror/explorer/relay are independent
- If explorer fails, relay still runs (they're concurrent, Listr2 default is `exitOnError: true` per-task but sibling tasks complete)
- The parent parallel group reports failure if either pipeline fails
- The single lease is **always released** in the `finally` block regardless of errors
- Component deployment toggles (`deployMirrorNode`, `deployExplorer`, `deployRelay`) are respected — skipped components don't affect parallelization

## Verification

1. **Manual E2E test**: Run `solo one-shot single deploy` and verify all components deploy successfully
2. **Timing verification**: Compare total deploy time before/after (expect ~20-35% reduction)
3. **Lease verification**: Confirm only ONE K8s Lease object exists during the deploy (use `kubectl get leases -n <namespace> -w`)
4. **Existing test suite**: Run `test/e2e/commands/one-shot-single.test.ts`
5. **Falcon test**: Run `solo one-shot falcon deploy --values-file <file>` and verify same behavior
6. **Toggle test**: Run `solo one-shot falcon deploy --deploy-mirror-node=false --deploy-explorer=false` to verify partial deployments work with parallelization
7. **Error recovery**: Kill the process mid-deploy, verify the lease expires after 20s and a re-deploy can acquire it

## Critical Files

- `src/commands/one-shot/default-one-shot.ts` -- Primary orchestration (restructure task list, add single lease)
- `src/commands/one-shot/one-shot-single-deploy-config-class.ts` -- Config interface (has deployment toggles)
- `src/commands/flags.ts` -- Add `oneShotMode` internal flag (note: `deployMirrorNode`, `deployExplorer`, `deployRelay` already added)
- `src/commands/command-helpers.ts` -- `argvPushGlobalFlags()` reads ConfigManager (constraint for Phase 2)
- `src/commands/block-node.ts` -- Guard lease acquisition (5 methods, 10 locations)
- `src/commands/mirror-node.ts` -- Guard lease acquisition (3 methods, 6 locations)
- `src/commands/relay.ts` -- Guard lease acquisition (3 methods, 6 locations)
- `src/commands/explorer.ts` -- Guard lease acquisition (3 methods, 6 locations)
- `src/commands/network.ts` -- Guard lease acquisition (2 methods, 4 locations)
- `src/commands/node/tasks.ts` -- Guard lease acquisition (2 locations)
- `src/commands/cluster/tasks.ts` -- Guard lease acquisition (1 location)
- `src/commands/rapid-fire.ts` -- Guard lease acquisition (4 locations)
- `src/core/command-handler.ts` -- Guard lease release in `commandAction()` (2 locations)
- `src/core/lock/listr-lock.ts` -- No changes needed
- `src/core/lock/lock-manager.ts` -- No changes needed
- `src/core/config-manager.ts` -- Phase 2: add snapshot/restore
- `src/business/runtime-state/config/remote/remote-config-runtime-state.ts` -- Phase 2: add persist mutex
