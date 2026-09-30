# Solo TCK — Compatibility Kit Design

**Status:** Draft, aligned to Keith's PRD v0.2 (Notion — **not mirrored into GitHub**) ·
[roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) · **Related:**
[#4269](https://github.com/hiero-ledger/solo/issues/4269) (`--edge`),
[#5021](https://github.com/hiero-ledger/solo/issues/5021) (local component build)

## 1. What / why / not

A versioned compatibility kit owned by the Solo team, answering one question about a candidate component
build: _does it deploy cleanly via a supported Solo release and produce a functional network?_ It runs in
each consumer's CI against their **branch build** — at PR time where that team already runs Solo per PR,
otherwise on their existing schedule. Consumers: **CN, Mirror Node, Block Node, JSON-RPC Relay**, the **JS
SDK**, and **Solo itself**.

- **Why.** A component PR that breaks the deployment contract passes its own CI, merges, and ships; Solo
  finds out when bumping the pin. Intended inversion: components own their Solo-integration signal at their
  own gate, and Solo's per-PR matrix — today full of component coverage in disguise — shrinks toward Solo
  mechanics.
- **Augments, not replaces.** Every consumer already runs Solo to host its own unreleased build.
- **Not yet a TCK.** Solo's contract — chart structure, config keys, labels, Helm-values schema, image
  entrypoints, env vars, CLI behaviour — is **implicit**, so this is an integration gate until it is written
  (TCK-D4).
- **Name risk.** **"TCK" already means the SDK TCK** in consumers' CI (CN `819-call-tck-regression.yaml`, BN
  `run-tck-regression-tests`). The sources also conflate two products: **N components × 1 contract** (#4272,
  TCK-shaped) and **1 tool × M tuples** (roadmap#199, a matrix with nothing to "conform" to).
- **Out of scope.** Perf/longevity (SDPT/SDLT/MDLT stay put; memory smoke in scope, §5) and the **Explorer
  UI**. Explorer's **server API is in scope** as a verification channel — and since Explorer runs no Solo
  today, that integration is entirely new CI.

## 2. Architecture

```text
Component CI ─► build candidate image ─► kind load ─► invoke the kit (§4)
        ▼
Solo TCK runner (Mocha + TypeScript)
  ├─ Solo adapter ─────► subprocess('solo', argv)
  └─ Probe layer ──────► kubectl + mirror REST + JSON-RPC + SDK HCS
```

**Building the candidate** is the gating dependency. End state: per-component build actions in
`solo-build-actions` ([TSC#298](https://github.com/hiero-ledger/tsc/issues/298)) feeding
`hiero-solo-action`; `#5021` is the interim mechanism. **Neither exists yet** — `solo-build-actions` is
empty, #5021 has not started, only CN has a local-build path (a JAR side-load, not an image swap), and
MN/Relay branch builds are not deployable at all.

**Black-box is the external contract, not an implementation mandate.** What the kit _asserts_ must be
observable without Solo internals; how in-repo suites _invoke_ Solo may stay in-process, and only the
distributed entry point (§4) must be out-of-process. A blanket port is not viable: e2e calls `main(argv)`
in-process at ~100 sites with zero subprocess spawns, forfeiting the coverage `zxc-code-analysis.yaml`, c8,
CodeCov and Codacy depend on, and half its files use the typed Kubernetes client or test Solo's own
libraries, which have no CLI surface. **Decision: recreate suites against the observable contract, scoped
narrowly.**

**Never trust Solo's own success message** — verify through Kubernetes state, mirror REST, JSON-RPC and an
HCS smoke transaction. Pod-readiness alone false-passes on an undersized PVC
([#5875](https://github.com/hiero-ledger/solo/issues/5875)).

## 3. Version resolution — OPEN (PRD vs roadmap#199)

The candidate is the branch build; what the _other_ components use is unresolved. **PRD:** latest-stable, or
hybrid (candidate provided, others latest-stable but overridable), `--edge` an open sub-question.
**roadmap#199:** external pinned-tuple manifests (mainnet/testnet). **Reconcile before locking.** TCK-D1
recommends **hybrid for PR-time + a pinned tuple for release/nightly** — different questions, and they
compose. Three constraints on whatever is chosen:

1. **Not "profiles"** — `ProfileManager`, `--profile`/`--profile-file` and `test/data/test-profiles.yaml`
   already mean _resource-sizing presets_. Use **compatibility manifest** / **version tuple**.
2. **State the precedence order** — CLI flag → `solo.config.yaml` → manifest → `--edge` → `version.ts`
   (itself env-overridable). Five sources, currently unordered.
3. **Emit the _resolved_ tuple.** Both edge resolvers (`edge-version-fetcher.ts` and the inline one in
   `deploy-argv-builders.ts`) fall back silently to static pins on network failure, so a run can test a
   different tuple than intended with nothing recording it. Net-new work: `solo deployment config info`
   reports compile-time constants ([#5384](https://github.com/hiero-ledger/solo/issues/5384)) and the
   remote-config ConfigMap stores no component versions.

Bounded by the support window in [#3608](https://github.com/hiero-ledger/solo/issues/3608): two quarters,
≈ six CN versions. Versions inject as CLI flags (preferred) with env fallback:

| Component      | CLI flag                   | Env var                  | `version.ts` constant           |
| -------------- | -------------------------- | ------------------------ | ------------------------------- |
| Consensus node | `--consensus-node-version` | `CONSENSUS_NODE_VERSION` | `HEDERA_PLATFORM_VERSION`       |
| Mirror node    | `--mirror-node-version`    | `MIRROR_NODE_VERSION`    | `MIRROR_NODE_VERSION`           |
| Relay          | `--relay-version`          | `RELAY_VERSION`          | `HEDERA_JSON_RPC_RELAY_VERSION` |
| Block node     | `--block-node-version`     | `BLOCK_NODE_VERSION`     | `BLOCK_NODE_VERSION`            |

**Interdependency gating (TCK-D5).** _"CN X requires BN Y"_ belongs inside Solo, not the kit — but Solo
cannot express it: every gate is unary, scattered across five files, and enforcement-only, so nothing can
ask _"is this tuple valid?"_ without deploying it. Unaddressed, the burden falls back on the kit. In-repo
template: `component-upgrade-rules.ts` + `resources/component-upgrade-migrations.json` → a sibling
`component-compatibility.json` evaluated against the resolved tuple before deploy.

## 4. Triggers and invocation

| Trigger                     | Where         | Candidate                    | Purpose                                 |
| --------------------------- | ------------- | ---------------------------- | --------------------------------------- |
| **Consumer gate** (primary) | consumer's CI | the branch build             | gate a component change on Solo compat  |
| **Solo PR**                 | Solo CI       | supported component versions | gate a Solo change on component compat  |
| **Release / nightly tuple** | Solo CI       | a pinned tuple               | roadmap#199 release signal (pending §3) |

Distribution, in priority order: a **versioned composite Action** (the org's proven pattern via
`hiero-solo-action`, shipped as a subdirectory action behind a stub root `action.yml` per TSC#298); a
**Docker image**, because a workflow-only kit is not independently runnable — the substance of the "Solo CI
as the TCK" objection — and must not nest Solo inside a CI container; and a **cross-repo reusable workflow**
as an optional later enhancement (TCK-6a; no hiero-ledger repo uses one today, so Actions-policy and token
scope are unknowns).

| Caller input             | Required | Meaning                                                                  |
| ------------------------ | -------- | ------------------------------------------------------------------------ |
| `component`              | yes      | `consensus-node` \| `mirror-node` \| `block-node` \| `relay` \| `js-sdk` |
| `candidate`              | yes      | the branch build (via `solo-build-actions` / #5021) or a version         |
| `solo-version`           | no       | a published Solo version **or** a Solo branch build                      |
| `topology`               | no       | which topology suite(s) to run                                           |
| `scope`                  | no       | `pr-core` \| `extended` \| `nightly` — the §5 tiers                      |
| `non-candidate-versions` | no       | override for the other components; default per §3                        |

**No sixth Solo pin.** Consumers already pin Solo five ways — CN `.citr-env` v0.87.1, MN `v0.88.1`, BN input
default `0.88.1`, Relay on the deprecated `@hashgraph/solo@0.85.0`, `hiero-solo-action` default `0.88.0` —
so the kit accepts the caller's Solo version (TCK-D3).

## 5. Run contract, suites, time budget

A **fail** does not assign _fault_ — an intentional component change may legitimately require Solo to adapt
— but must assign a **class**, or consumers will not keep the gate green:

| Class                      | Meaning                                     | Gates |
| -------------------------- | ------------------------------------------- | ----- |
| `component-non-conformant` | the candidate violates the contract         | yes   |
| `solo-defect`              | Solo cannot yet support a legitimate change | no    |
| `infrastructure`           | cluster/runner/network flake                | no    |

Per `hiero-sdk-tck`, an unimplemented capability reports `NOT_IMPLEMENTED` and **skips rather than fails**,
making partial conformance expressible. `DiagnosticsFinding` (`src/commands/util/diagnostics-finding.ts`) is
already most of this schema but renders only as markdown, so a `--output json` emitter is the cheapest
machine-readable verdict — once its false positives are addressed
([#5203](https://github.com/hiero-ledger/solo/issues/5203),
[#5914](https://github.com/hiero-ledger/solo/issues/5914)).

**Published record (TCK-13).** roadmap#199 wants a results artifact per Solo release, so teams get a signal
without running Solo CI themselves. Model on `cncf/k8s-conformance`: a git-tracked entry per `(Solo version,
resolved tuple, kit version, date, verdict)`. Today's only published claim is the README "Current Releases"
table — a Consensus Node column and nothing else, scraped by literal string.

**Budget: 15–30 min per invocation** (PRD G1). Tiers — still to reconcile with block-node's `single` /
`paired-3` / `7cn-3bn-distributed`:

| Topology                       | Tier     | ~Runtime | Gates                                                    |
| ------------------------------ | -------- | -------- | -------------------------------------------------------- |
| `single`                       | pr-core  | ~5 min   | single-node bring-up + transfer smoke                    |
| `standard`                     | pr-core  | ~15 min  | multi-node + MN + Relay; HCS → mirror catchup → JSON-RPC |
| `block-node`                   | extended | ~15 min  | block node attached, BLOCK stream                        |
| `node-upgrade`                 | extended | ~10 min  | prior-stable CN → candidate                              |
| `dual-cluster` / `external-db` | nightly  | ~30 min  | multi-cluster shard/realm; external Postgres             |

**Tier selection is grounded in evidence:** `version.ts`'s `MINIMUM_*` constants are a codified changelog of
every component break Solo has absorbed.

| Gate                                                         | Breakage it encodes                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_DEDICATED_HEALTH_PORT` | BN moved health off the gRPC port; Solo hung ~1h40m ([#5283](https://github.com/hiero-ledger/solo/issues/5283)) |
| `MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS`                     | TSS bootstrap — widest blast radius, couples CN↔MN↔BN                                                           |
| `MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION` and two more       | MN resource restructure, renamed pinger env vars, arm64 image                                                   |
| `MINIMUM_CN_VERSION_FOR_SMALL_MEMORY` / `_STATE_ON_DISK`     | CN memory and state-layout changes                                                                              |
| `NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE/AFTER_CN_72`    | CN v0.72 broke the load-generator chart contract                                                                |

- **MN breaks most often** — strict-binding breakage as `CrashLoopBackOff` at deploy
  ([#4768](https://github.com/hiero-ledger/solo/issues/4768),
  [#5035](https://github.com/hiero-ledger/solo/issues/5035)); deploy-and-assert-healthy catches it.
- **Explorer and Relay have no `MINIMUM_*` gates** — Solo-side plumbing caught by pod-readiness
  ([#4195](https://github.com/hiero-ledger/solo/issues/4195),
  [#3874](https://github.com/hiero-ledger/solo/issues/3874)), plus Relay readiness under low memory
  ([#4140](https://github.com/hiero-ledger/solo/issues/4140),
  [#4351](https://github.com/hiero-ledger/solo/issues/4351)). Cheap coverage, not deep.
- **Cross-component is the highest-value category** and no single-component suite covers it — CN+MN
  ([#4073](https://github.com/hiero-ledger/solo/issues/4073)), CN+BN
  ([#3972](https://github.com/hiero-ledger/solo/issues/3972)).
- **Assertions need canaries** — suites can silently stop testing
  ([#2109](https://github.com/hiero-ledger/solo/issues/2109), block-node e2e a no-op for a period).

**Mini-performance check (TCK-5).** Reuse the existing perf suite's load types at ~1 min each. Fixed
overheads then dominate (60 s importer warmup, 30 s cooldown, ~35 s RTT probe) and the 3000 MB gate is
calibrated on _sustained_ load, so report it as **evidence the load path works**, not a TPS/latency signal.
It does not fit inside 15 minutes.

## 6. Blocking opens

1. **Version-resolution model** (§3) — reconcile PRD vs roadmap#199 with Keith/leadership first.
2. **The Solo Deployment Contract does not exist** (§1, TCK-D4) — prerequisite to the name.
3. **Solo cannot express cross-component constraints** (§3, TCK-D5) — net-new work.
4. **Branch builds are not deployable** for four of five components (§2) — gates TCK-1.
5. **`hiero-solo-action` ownership** — maintained outside the core Solo CI group; confirm write access
   before the design's assumption that we update it.
6. **JDK axis** — chartered by roadmap#199, but Solo has no flag for it; needs an owner or a v1 exclusion.
