# Solo TCK — Compatibility Kit Design

**Status:** Draft (aligned to Keith's PRD v0.2)
**Upstream:** Keith's Solo TCK PRD (Notion, v0.2 — **not mirrored into GitHub; see §10**) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) · **Related:** [#4269](https://github.com/hiero-ledger/solo/issues/4269) (`--edge`), [#5021](https://github.com/hiero-ledger/solo/issues/5021) (local component build)

> Defers to Keith's PRD where they differ. One material PRD/roadmap discrepancy — the version-resolution
> model — is flagged in §6.3 for leadership to settle.

## Table of contents

- [1. Summary](#1-summary)
- [2. Motivation](#2-motivation)
- [3. What it is — and is not](#3-what-it-is--and-is-not)
- [4. Consumers](#4-consumers)
- [5. Current state](#5-current-state)
- [6. Architecture](#6-architecture)
- [7. Run contract](#7-run-contract)
- [8. Time budget and suite selection](#8-time-budget-and-suite-selection)
- [9. Mini-performance check](#9-mini-performance-check)
- [10. Open questions](#10-open-questions)
- [11. References](#11-references)

## 1. Summary

A versioned compatibility kit owned by the Solo team, answering one question for a candidate component
build (or JS SDK release):

> _Does this candidate deploy cleanly via a supported Solo release and produce a functional network?_

It runs in each consumer's own CI against their **branch build** — at PR time where that team already runs
Solo per PR, otherwise on their existing schedule — and returns a single pass/fail signal. It **augments**
the Solo orchestration each consumer maintains today rather than replacing it: every one of them runs Solo
to host its own unreleased build, which a compatibility kit does not substitute for.

Consumers: **CN, Mirror Node, Block Node, JSON-RPC Relay**, the **JS SDK**, and **Solo itself**.

## 2. Motivation

**Compatibility is tested too late.** Solo's CI catches regressions from _Solo_ PRs, but components get no
Solo-owned signal on _their_ PRs. A component PR that breaks the deployment contract — a chart change, a
config-key rename, a missing label — passes its own CI, merges, and ships; Solo discovers it when bumping
the pin.

**Solo's tests are overloaded with component functionality.** Its per-PR matrix has accumulated e2e
variants that are really component coverage in disguise (block-node attach, mirror external DB,
node-upgrade across CN tags, dual-cluster shard/realm).

The goal is a **test-ownership inversion**: components own their Solo-integration signal at their own
gate; Solo's tests shrink toward Solo mechanics. Separately, roadmap#199 wants each Solo _release_
validated against a known-good tuple — a complementary trigger over the same kit (§6.4).

## 3. What it is — and is not

A TCK verifies that a candidate satisfies a defined compatibility contract. Solo's contract is the
interface between Solo and a component: chart structure, config keys, labels, Helm-values schema, image
entrypoints, env vars, CLI behaviour.

**That contract is currently implicit, and closing that gap comes first.** Every established TCK — Jakarta
EE, CNCF Certified Kubernetes, our own [hiero-sdk-tck](https://github.com/hiero-ledger/hiero-sdk-tck) —
pairs the suite with a _written specification_ the tests map onto. `hiero-sdk-tck` publishes one spec per
transaction type mirroring its test tree, each with an `Implemented (Y/N)` column, and requires spec
changes to be approved by every consuming SDK's lead before test code is written. Until an equivalent
**Solo Deployment Contract** exists (TCK-D4), the first question an external team asks — _"what am I
conforming to?"_ — has no answer, and this is an integration gate rather than a conformance kit.

**On the name.** Two products are in play and the sources conflate them: **N components × 1 contract** (the
per-PR suite, epic #4272 — genuinely TCK-shaped) and **1 tool × M version tuples** (the release matrix,
roadmap#199 — a compatibility matrix, with nothing for a team to "conform" to). Covering both under one kit
is workable, but the name must not overclaim. Note **"TCK" already means the SDK TCK in consumers' CI** —
CN's `819-call-tck-regression.yaml`, Block Node's `run-tck-regression-tests` — so "Solo TCK" unqualified
will be misread there.

- **Black-box in what it asserts**: judged only on observable outputs — Kubernetes state, mirror REST,
  JSON-RPC, Explorer API — never Solo's own success message (§6.2). The distributed entry point drives
  `solo` out-of-process, so consumers see it as a user does.
- **Not** Solo's e2e suite relabeled: suites are re-authored against the observable contract, and the kit
  is **released independently of Solo's cadence** even though it lives in the Solo repo (TCK-D2).

**Non-goals:** not a full performance/longevity suite (SDPT/SDLT/MDLT stay put; a memory smoke is in scope,
§9); not a replacement for Solo's unit/integration tests; not a workload generator. The **Explorer UI** is
out of scope — a UI-only repo with no Kubernetes in CI — but its **server API is in scope** as a
verification channel.

## 4. Consumers

Compatibility risks the kit protects each consumer from:

- **hiero-consensus-node** — default settings breaking deploy/operate; new requirements shipping before
  Solo supports them; new requirements breaking older CN versions without a Solo version gate; deprecated
  settings erroring instead of being ignored; increased memory/cpu footprint.
- **hiero-mirror-node** — breaking Solo's MN config defaults; MN version dependencies without Solo gates;
  increased footprint. _Most frequently broken component; see §8._
- **hiero-block-node** — breaking older BN versions without gate logic or collision handling; requiring new
  BN configuration as the Solo default; increased footprint.
- **hiero-json-rpc-relay** — a Relay PR breaking Solo deployment; Solo passing an empty/incorrect chart
  version so a new chart installs against an old image ([#3874](https://github.com/hiero-ledger/solo/issues/3874));
  readiness under low memory, the most common relay failure today
  ([#4140](https://github.com/hiero-ledger/solo/issues/4140), [#4351](https://github.com/hiero-ledger/solo/issues/4351));
  MN version dependencies without a Solo gate.
- **Hiero JS SDK** (a library Solo depends on) — removed deprecated calls, signature changes, connection
  changes.
- **Solo itself** — a Solo PR breaking compatibility with supported component versions.

## 5. Current state

Mostly extraction and decoupling, not greenfield:

- `test/e2e` already has reusable command wrappers (`ConsensusNodeTest`, `MirrorNodeTest`, …), composed
  topology suites, and runtime smoke submitting HCS transactions via `@hiero-ledger/sdk`.
- **`hiero-solo-action`** is the existing bring-up primitive; the kit is the assertion layer on top.
- Inlined Solo orchestration is duplicated across CN, MN, BN and Relay workflows, each pinning a different
  Solo version by hand. The kit can absorb the shared bring-up.
- Solo's per-PR matrix (`e2e-test-matrix.json`, ~12 suites, ~80 min wall-clock) is the pool that shrinks as
  coverage moves upstream — contingent on consumer adoption (TCK-12).

## 6. Architecture

### 6.1 Model

```text
Component CI (CN / MN / BN / Relay / SDK / Solo PR)
  1. Build candidate images → kind load
  2. Invoke the kit (§6.5) with: solo-version, candidate build, topology
        │
        ▼
Solo TCK runner (Mocha + TypeScript)
  ├─ Topology suites
  ├─ Solo adapter ─────► subprocess('solo', argv)
  └─ Probe layer ──────► kubectl + mirror REST + JSON-RPC + SDK HCS
        │
        ▼
  JUnit XML + mochawesome + exit code
```

**Building the candidate.** Per-component build actions live in one repo, `solo-build-actions`
(governance-approved per [TSC#298](https://github.com/hiero-ledger/tsc/issues/298); maintainers
nathanklick / jeromy-cannon / jan-milenkov), replacing the five separate repos originally floated. A
component PR calls the matching action, which builds the branch image and feeds `hiero-solo-action`; the
kit then runs against that network. `#5021` is the interim mechanism. **Neither exists yet** —
`solo-build-actions` is an empty repo and #5021 has not started, so today only CN has a real local-build
path (a JAR side-load, not an image swap); MN and Relay branch builds are not deployable at all.

**Test-authoring strategy.** Three options: (1) reuse `test/e2e` in-process as-is, (2) recreate it using
its logic against the observable contract, (3) write new tests. Recommend **(2), scoped narrowly** — the
scoping matters more than the choice, because a blanket port is not viable:

- Solo's e2e suites do not invoke the CLI today. They call `main(argv)` in-process at ~100 call sites
  across 23 files, with **zero** subprocess spawns. Moving out-of-process forfeits the coverage
  instrumentation `zxc-code-analysis.yaml`, c8, CodeCov and Codacy depend on, plus typed assertions.
- About half the e2e files (28 of 57) use the typed Kubernetes client, and the whole
  `test/e2e/integration/` tree (19 files) tests Solo's _own_ libraries — leases, `K8Factory`, the
  helm/kind/kubectl wrappers. Those have no CLI surface and must stay in-process.

So **black-box is the external contract, not a blanket implementation mandate**: what the kit _asserts_
must be observable without Solo internals; how in-repo suites _invoke_ Solo can stay in-process. Only the
distributed entry point (§6.5) must be genuinely out-of-process, since that is what consumers run.

### 6.2 Independent verification

A run passes only if every `solo` subcommand exits 0, all expected pods reach `Ready`, an HCS smoke
transaction returns `SUCCESS` and is visible via mirror REST within the catchup window, JSON-RPC is
reachable where the relay is deployed, and teardown is clean. **The kit never trusts Solo's own success
message.** Note a pods-Ready check alone inherits a known false pass — a PVC on undersized storage
currently reports a successful deploy ([#5875](https://github.com/hiero-ledger/solo/issues/5875)).

### 6.3 Version resolution — OPEN (PRD vs roadmap#199)

The candidate is the **branch build** under test. What the _other_ components use is unresolved:

- **Keith's PRD:** non-candidates resolve to **latest-stable**, or a **hybrid** (candidate provided, others
  latest-stable but overridable); an **edge** mode is an open sub-question.
- **roadmap#199:** non-candidate versions come from **external pinned-tuple manifests** (mainnet/testnet).

**These must be reconciled before the strategy is locked.** TCK-D1 recommends **hybrid for PR-time + a
pinned tuple for release/nightly** — they answer different questions (_"does my branch break Solo?"_ vs
_"is this release's tuple known-good?"_) and compose. Three constraints on whatever is chosen:

1. **Do not call them "profiles".** `ProfileManager`, `--profile`/`--profile-file` and
   `test/data/test-profiles.yaml` already mean _resource-sizing presets_ in the same CLI. Use
   **compatibility manifest** or **version tuple**.
2. **State the precedence order.** Explicit CLI flag → `solo.config.yaml` → manifest → `--edge` →
   `version.ts` (itself env-overridable). Five sources, currently unordered.
3. **Emit the _resolved_ tuple, not the requested one.** Solo has two independent edge resolvers
   (`edge-version-fetcher.ts` and the inline one in `deploy-argv-builders.ts`) hitting different GitHub
   endpoints with different prerelease semantics, and **both fall back silently to static pins on network
   failure** — so a run can test a different tuple than intended with nothing recording it. This is
   net-new work: `solo deployment config info` reports compile-time constants rather than deployed versions
   ([#5384](https://github.com/hiero-ledger/solo/issues/5384)), and the remote-config ConfigMap stores no
   component versions.

The matrix is bounded by the support window in [#3608](https://github.com/hiero-ledger/solo/issues/3608):
two quarters, ≈ six CN versions.

Versions are injected as CLI flags (preferred) with env-var fallback:

| Component      | CLI flag                   | Env var                  | `version.ts` constant           |
| -------------- | -------------------------- | ------------------------ | ------------------------------- |
| Consensus node | `--consensus-node-version` | `CONSENSUS_NODE_VERSION` | `HEDERA_PLATFORM_VERSION`       |
| Mirror node    | `--mirror-node-version`    | `MIRROR_NODE_VERSION`    | `MIRROR_NODE_VERSION`           |
| Relay          | `--relay-version`          | `RELAY_VERSION`          | `HEDERA_JSON_RPC_RELAY_VERSION` |
| Block node     | `--block-node-version`     | `BLOCK_NODE_VERSION`     | `BLOCK_NODE_VERSION`            |

**Interdependency gating.** Constraints like _"CN X requires BN Y"_ belong **inside Solo**, not the kit.
That division is right but not free: **Solo cannot express such a constraint today.** Every gate is unary —
one version against one literal — scattered across `helpers.ts`, `profile-manager.ts`, `network.ts`,
`block-node.ts`, `mirror-node.ts`; nothing relates two component versions, and gates are enforcement-only,
so nothing can ask _"is this tuple valid?"_ without deploying it. Left unaddressed the burden falls back on
the kit. The fix has a proven in-repo template — `component-upgrade-rules.ts` +
`resources/component-upgrade-migrations.json` (external JSON, versioned boundaries, `reason` strings) —
applied as a sibling `component-compatibility.json` evaluated against the resolved tuple before deploy.
Tracked as **TCK-D5**.

### 6.4 Triggers

| Trigger                     | Where         | Candidate                    | Purpose                                   |
| --------------------------- | ------------- | ---------------------------- | ----------------------------------------- |
| **Consumer gate** (primary) | consumer's CI | the branch build             | gate a component change on Solo compat    |
| **Solo PR**                 | Solo CI       | supported component versions | gate a Solo change on component compat    |
| **Release / nightly tuple** | Solo CI       | a pinned tuple               | roadmap#199 release signal (pending §6.3) |

### 6.5 Invocation surface

A gate needs a **synchronous** verdict, so the kit runs inline in the consumer's pipeline — not by
dispatching into Solo and awaiting an async result.

- **Versioned composite Action** (primary) — the pattern this org has proven at scale
  (`hiero-solo-action`: 24 releases, ~11 consumer repos), distributed from the Solo repo as a subdirectory
  action behind a stub root `action.yml` per TSC#298.
- **Docker image** for local and non-GitHub-Actions runs. A kit that exists only as a workflow is not
  independently runnable, which is the substance of the "Solo CI as the TCK" objection. _(Not nested inside
  Solo's CI containers — that would add a fourth level to runner→Kind→component-containers.)_
- **Reusable cross-repo workflow** (optional, later) — **no hiero-ledger repo uses one today**; every
  `uses:` is the local form. This would be the org's first, with Actions-policy and token-scope unknowns.
  Keep the POC (TCK-6a) as an enhancement path, not the critical path.

**Caller inputs**, kept minimal:

| Input                    | Required | Meaning                                                                  |
| ------------------------ | -------- | ------------------------------------------------------------------------ |
| `component`              | yes      | `consensus-node` \| `mirror-node` \| `block-node` \| `relay` \| `js-sdk` |
| `candidate`              | yes      | the branch build (via `solo-build-actions` / #5021) or a version         |
| `solo-version`           | no       | a published Solo version **or** a Solo branch build                      |
| `topology`               | no       | which topology suite(s) to run                                           |
| `scope`                  | no       | `pr-core` \| `extended` \| `nightly` — the §8 tiers                      |
| `non-candidate-versions` | no       | override for the other components; default per §6.3                      |

**Do not add a sixth Solo-version pin.** Consumers already pin Solo five ways — CN `.citr-env` v0.87.1, MN
`v0.88.1` hardcoded, BN input default `0.88.1`, Relay on the deprecated `@hashgraph/solo@0.85.0`,
`hiero-solo-action` default `0.88.0`. The kit should accept the caller's Solo version.

## 7. Run contract

### 7.1 Verdict

`pass | fail | skip`, decided by §6.2. Reporting is JUnit XML + mochawesome + exit code.

A **fail** does not assign _fault_ — an intentional component change may legitimately require Solo to adapt
— but it must assign a **class**, or consumers cannot act on it and will not keep the gate green:

| Class                      | Meaning                                     | Gates |
| -------------------------- | ------------------------------------------- | ----- |
| `component-non-conformant` | the candidate violates the contract         | yes   |
| `solo-defect`              | Solo cannot yet support a legitimate change | no    |
| `infrastructure`           | cluster/runner/network flake                | no    |

`skip` needs rules too. `hiero-sdk-tck`'s model is the precedent: an unimplemented capability reports
`NOT_IMPLEMENTED` and **skips rather than fails**, making partial conformance expressible.

`DiagnosticsFinding` (`src/commands/util/diagnostics-finding.ts`) is already most of this schema —
`{category, title, source, evidence[]}` with categories `image-pull | oom | pod-readiness |
consensus-active | log-exception | app-error` mapping almost 1:1 onto the failures in §8. It is rendered
only as markdown today; a `--output json` emitter is the cheapest path to a machine-readable verdict, once
its false-positive history is addressed ([#5203](https://github.com/hiero-ledger/solo/issues/5203),
[#5914](https://github.com/hiero-ledger/solo/issues/5914)).

### 7.2 Published record

roadmap#199 asks for a results artifact published **per Solo release**, so teams get _"a compatibility
signal without running Solo CI themselves"_. This is load-bearing: without a record, a consumer's only
access to the signal **is** a CI run — which is the "Solo CI workflows as the TCK" shape raised in review.

Model on `cncf/k8s-conformance`: a git-tracked entry per `(Solo version, resolved tuple, kit version, date,
verdict)`. The current channel is inadequate — the only published compatibility claim is the README
"Current Releases" table, which has a **Consensus Node column and nothing else** and reaches the site
through a literal-string scrape; the other four components' supported versions exist only in `version.ts`.
Tracked as TCK-13.

## 8. Time budget and suite selection

Target **15–30 minutes per invocation** (PRD G1). Proposed tiers — reconcile vocabulary with block-node's
existing `single` / `paired-3` / `7cn-3bn-distributed`:

| Topology                       | Tier     | ~Runtime | Gates                                                    |
| ------------------------------ | -------- | -------- | -------------------------------------------------------- |
| `single`                       | pr-core  | ~5 min   | single-node bring-up + transfer smoke                    |
| `standard`                     | pr-core  | ~15 min  | multi-node + MN + Relay; HCS → mirror catchup → JSON-RPC |
| `block-node`                   | extended | ~15 min  | block node attached, BLOCK stream                        |
| `node-upgrade`                 | extended | ~10 min  | prior-stable CN → candidate                              |
| `dual-cluster` / `external-db` | nightly  | ~30 min  | multi-cluster shard/realm; external Postgres             |

**Which suites gate a PR must be grounded in evidence, and the evidence already exists.** `version.ts`'s
`MINIMUM_*` constants are a codified changelog of every component break Solo has absorbed — each one forced
a version gate into the code:

| Gate                                                         | Breakage it encodes                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_DEDICATED_HEALTH_PORT` | BN moved health off the gRPC port; Solo hung ~1h40m ([#5283](https://github.com/hiero-ledger/solo/issues/5283)) |
| `MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS`                     | TSS bootstrap — widest blast radius, couples CN↔MN↔BN                                                           |
| `MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION` and two more       | MN resource restructure, renamed pinger env vars, arm64 image                                                   |
| `MINIMUM_CN_VERSION_FOR_SMALL_MEMORY` / `_STATE_ON_DISK`     | CN memory and state-layout changes                                                                              |
| `NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE/AFTER_CN_72`    | CN v0.72 broke the load-generator chart contract                                                                |

Three conclusions drive tier selection:

- **Mirror Node breaks most often**, via config-property/strict-binding breakage surfacing as
  `CrashLoopBackOff` at deploy ([#4768](https://github.com/hiero-ledger/solo/issues/4768),
  [#5035](https://github.com/hiero-ledger/solo/issues/5035)). Deploy-and-assert-healthy catches it.
- **Explorer and Relay have no `MINIMUM_*` gates** — their failures were Solo-side plumbing caught by plain
  pod-readiness ([#4195](https://github.com/hiero-ledger/solo/issues/4195), #3874). Cheap coverage, not deep.
- **The highest-value category is cross-component**, which no single-component suite covers: CN+MN
  ([#4073](https://github.com/hiero-ledger/solo/issues/4073)), CN+BN
  ([#3972](https://github.com/hiero-ledger/solo/issues/3972)).

A caution: suites can silently stop testing — Solo's block-node e2e test was a no-op for a period
([#2109](https://github.com/hiero-ledger/solo/issues/2109)). Assertions need their own canaries.

## 9. Mini-performance check

A memory-footprint / stability smoke (~5–15 min), not a perf suite. Reuse the load types the existing perf
suite exercises (several at ~5 min each) but run each for ~1 minute.

**Be honest about what that buys.** Each load already carries 60 s mirror-importer warmup and 30 s
cooldown, and the RTT probe needs ~35 s, so at 1 minute the measurement is a minority of the phase. The
existing 3000 MB memory gate is calibrated on _sustained_ load, and memory-growth regressions are exactly
what the 5-minute duration exists to surface. Treat this as **a smoke test that the load path works**, not
a TPS/latency conformance signal — and note it still does not fit inside 15 minutes.

## 10. Open questions

**Decided:** repo home is the Solo repo (TCK-D2); distribution leads with a versioned composite action
(§6.5); suite selection is grounded in the `MINIMUM_*` evidence (§8); the verdict gains a failure class
(§7.1).

- **Version-resolution model** (§6.3) — **load-bearing; reconcile with Keith/leadership first.**
- **The Solo Deployment Contract does not exist** (§3) — prerequisite to the name. TCK-D4.
- **Solo cannot express cross-component constraints** (§6.3) — net-new work. TCK-D5.
- **Naming** — "TCK" already means the SDK TCK in CN and Block Node CI.
- **Topology vocabulary** — `scope` now matches the §8 tiers; block-node's names still to reconcile.
- **Version variable** — separate kit pin vs accepting the caller's Solo version (§6.5 argues the latter;
  TCK-D3 reconciles).
- **JDK axis** — chartered by roadmap#199 but Solo has no flag for it; needs an owner or a v1 exclusion.
- **Published record** (§7.2) — confirm roadmap#199 still requires it, and where it lives.
- **Branch-build availability** — `solo-build-actions` is empty and #5021 has not started; MN and Relay
  branch builds are not deployable. Gates TCK-1 for four of five components.
- **`hiero-solo-action` ownership** — maintained outside the core Solo CI group and used by SDK repos, not
  the component teams. Confirm write access before depending on updating it.
- **A user-facing guide is a separate deliverable** — `docs/design/` is never synced to solo-docs, and the
  pipeline only carries generated CLI help and error pages. TCK-14.

## 11. References

- Keith's Solo TCK PRD (Notion, Draft v0.2) — authoritative upstream, **not yet mirrored into GitHub**
- [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) · [#4272](https://github.com/hiero-ledger/solo/issues/4272) · [#4269](https://github.com/hiero-ledger/solo/issues/4269) · [#5021](https://github.com/hiero-ledger/solo/issues/5021)
- [TSC#298](https://github.com/hiero-ledger/tsc/issues/298) — `solo-build-actions` approval and the
  subdirectory-action precedent
- [hiero-sdk-tck](https://github.com/hiero-ledger/hiero-sdk-tck) — spec-plus-suite precedent
- `test/e2e` — the framework the kit is extracted from · `hiero-solo-action` — the bring-up primitive
