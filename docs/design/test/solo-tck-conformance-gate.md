# Solo TCK — Compatibility & Conformance Gate

**Status:** Draft
**Roadmap driver:** [hiero-ledger/roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) (2026 Q3)
**Tracking epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
**Blocks:** [#4269](https://github.com/hiero-ledger/solo/issues/4269) (`--edge` version resolution)

## Table of contents

- [1. Summary](#1-summary)
- [2. Motivation](#2-motivation)
- [3. What this is — and is not](#3-what-this-is--and-is-not)
- [4. Current state](#4-current-state)
- [5. Component coverage gaps](#5-component-coverage-gaps)
- [6. Core concepts](#6-core-concepts)
- [7. Architecture](#7-architecture)
- [8. The compatibility run contract](#8-the-compatibility-run-contract)
- [9. Time budget and the required gate](#9-time-budget-and-the-required-gate)
- [10. Mini-performance tier](#10-mini-performance-tier)
- [11. Implementation roadmap](#11-implementation-roadmap)
- [12. Open decisions](#12-open-decisions)
- [13. References](#13-references)

## 1. Summary

The Solo TCK is a **version-parameterized compatibility suite** that validates a **known-good
component tuple** — `{consensus node × mirror node × block node × relay × explorer × JDK}` — so a Solo
release can be cut with a machine-verifiable compatibility signal instead of per-component manual
regression.

Solo acts as the shared **compatibility harness**. The pinned tuple is defined in **external profile
files** (e.g. mainnet, testnet) that Solo reads. A run deploys a real network through Solo for a given
profile — optionally overriding **one** tuple entry with a candidate version — then verifies the
result against the mirror node and the cluster, never against Solo's own success message.

The same suites serve three consumers: a required per-component **PR gate**, a **nightly tuple
validation**, and a **per-release published compatibility artifact** that component teams consume to
verify their own releases against Solo.

## 2. Motivation

Solo assembles five independently-released components into a working Hiero network. Two forces make
this fragile:

1. **Components release on their own schedules.** A new component version can change a config key, a
   startup ordering, or a database schema and break Solo through no fault of Solo's own code. Nothing
   today automatically catches this before it reaches a user.
2. **[#4269](https://github.com/hiero-ledger/solo/issues/4269) makes that risk explicit.** The
   `--edge` flag will have Solo auto-pull the latest released version of every component. That cannot
   be turned on safely without a gate that proves a given version (or the latest-of-everything
   combination) actually deploys and works. That gate is this TCK — which is why #4269 depends on
   #4272.

Unit tests prove functions work in isolation; they cannot prove that a *deployed network* behaves
correctly. Only an end-to-end deploy-then-verify can, and the value multiplies when the party running
it is the component team validating their own release.

**Success criteria (from roadmap #199).** A Solo release can be cut with a machine-verifiable
compatibility signal for the pinned tuple; bumping a component version becomes a profile edit rather
than a multi-week triage; and component teams can consume the TCK result to verify their own releases
against Solo.

## 3. What this is — and is not

The name "TCK" is borrowed from the [Hiero SDK TCK](https://github.com/hiero-ledger/hiero-sdk-tck),
but the model is different and the difference matters.

- **The SDK TCK verifies interchangeability** — six independent language implementations of one spec
  must behave identically. That is why it needs a JSON-RPC translator server per language. **Solo is a
  single implementation; there is nothing to cross-check for interchangeability.** None of that
  machinery applies here.
- **This TCK verifies downstream compatibility** — many independent *producers* (component teams)
  certify their artifact against one shared harness (Solo). This is the
  [CNCF Kubernetes conformance](https://github.com/cncf/k8s-conformance) model (a vendor runs the
  suite against their distribution to demonstrate conformance), not the Jakarta/SDK
  multi-implementation model.

What we borrow from the SDK TCK is exactly one idea, and it is the important one:
**spec-first, independent verification** — after Solo reports success, confirm the real network state
via the mirror node and the cluster rather than trusting Solo's word.

## 4. Current state

The TCK is largely **governance and curation over assets that already exist**, not a greenfield build.

- **A dynamic E2E matrix already runs on every PR.** `flow-pull-request-checks.yaml` generates a
  matrix from `.github/workflows/support/e2e-test-matrix.json` (12 suites today) and fans out to
  `zxc-e2e-test.yaml` on self-hosted `hiero-solo-linux-*` runners.
- **Reusable per-component verification helpers already exist** —
  `test/e2e/commands/tests/relay-test.ts` and `explorer-test.ts` provide
  `verifyRelayDeployWasSuccessful` / `verifyExplorerDeployWasSuccessful`, consumed today as
  side-effects of composite suites rather than as first-class gates.
- **Component versions are already centralized and env-overridable** in `version.ts` (see
  [§6](#6-core-concepts)).
- **A perf tier already exists** — `performance.test.ts`, `small-memory-load.test.ts` (NLG-driven),
  plus a separate `flow-performance-test.yaml`.

The gaps are coverage guarantees, version parameterization at the CI boundary, an enforced time
budget, and an external invocation surface — not the raw ability to run E2E deploys.

## 5. Component coverage gaps

Mapping the current matrix against the five components from #4269:

| Component      | First-class gated suite? | How it is exercised today                         |
| -------------- | ------------------------ | ------------------------------------------------- |
| Consensus node | Yes                      | Standard, Node Add Local, Node Upgrade, One Shot  |
| Block node     | Yes                      | Block Node suite                                  |
| Mirror node    | No functional suite      | Incidental — External DB, One Shot deploy it      |
| Explorer       | **No**                   | Only rides along in dual-cluster / standard       |
| Relay          | **No**                   | Only rides along in external-database / dual      |

Explorer and relay have deploy-and-verify helpers but no dedicated, independently-selectable gate. A
change that breaks only the relay (cf. [#4963](https://github.com/hiero-ledger/solo/issues/4963)) is
caught only by luck. Promoting the existing helpers into named suites is a primary deliverable.

## 6. Core concepts

### 6.1 Independent verification

A test passes only when the **real network state** confirms it. After Solo reports a component is up,
the harness queries the mirror node REST API and the cluster (pod health, account existence) to
confirm. This is the one principle inherited from the SDK TCK and it is non-negotiable — especially
when certifying an artifact produced by another team.

### 6.2 The tuple, profiles, and "vary one component"

The unit of validation is a **component tuple** — a pinned version for each axis:

```text
{ consensus node × mirror node × block node × relay × explorer × JDK }
```

The **baseline** is a known-good tuple. Per the roadmap, tuples are **not** hard-coded in Solo; they
ship as **external profile files** (e.g. `mainnet`, `testnet`) that Solo reads as data. Keeping the
network-specific version tuples out of the source resolves the Hiero-neutral branding constraint and
makes "bump CN" a profile edit rather than a code change.

Solo already exposes the injection mechanism: every component version in `version.ts` is overridable
by an environment variable, so a profile (or a single override) maps onto env vars with no new
plumbing at the version layer:

```text
HEDERA_PLATFORM_VERSION        = env CONSENSUS_NODE_VERSION || 'v0.74.0'    (consensus node)
MIRROR_NODE_VERSION            = env MIRROR_NODE_VERSION    || 'v0.159.0'    (mirror node)
EXPLORER_VERSION               = env EXPLORER_VERSION       || '26.1.0'      (explorer)
HEDERA_JSON_RPC_RELAY_VERSION  = env RELAY_VERSION          || '0.77.0'      (relay)
BLOCK_NODE_VERSION             = env BLOCK_NODE_VERSION     || '0.38.0'      (block node)
```

A per-team compatibility run **overrides exactly one tuple entry and holds the rest at the profile
baseline**: set that one component's environment variable to the candidate; leave the others to
resolve from the profile.

```bash
# Mirror node team testing a candidate against the mainnet profile:
MIRROR_NODE_VERSION=v0.160.0-rc1   # the single override
# all other axes -> mainnet profile tuple (baseline)
solo one-shot single deploy ...
```

The reason for overriding only one axis is **attribution**: if the run fails, the candidate is the
only thing different from a known-good tuple, so the verdict points unambiguously at that version.
Validating the full profile tuple with no override is the release/nightly check (see §6.4).

### 6.3 The three names of each component

Every component is referred to by three different identifiers. The contract and docs must carry this
map to avoid confusion (note the traps on consensus node and relay):

| Component      | CLI flag                   | Env var                | `version.ts` constant           |
| -------------- | -------------------------- | ---------------------- | ------------------------------- |
| Consensus node | `--consensus-node-version` | `CONSENSUS_NODE_VERSION` | `HEDERA_PLATFORM_VERSION`     |
| Mirror node    | `--mirror-node-version`    | `MIRROR_NODE_VERSION`  | `MIRROR_NODE_VERSION`           |
| Explorer       | `--explorer-version`       | `EXPLORER_VERSION`     | `EXPLORER_VERSION`              |
| Relay          | `--relay-version`          | `RELAY_VERSION`        | `HEDERA_JSON_RPC_RELAY_VERSION` |
| Block node     | `--block-node-version`     | `BLOCK_NODE_VERSION`   | `BLOCK_NODE_VERSION`            |
| JDK            | —                          | (via CN image/build)   | —                               |

> **JDK** is a tuple axis with no current `version.ts` flag; how it is pinned and injected (via the
> consensus-node image/build) is an open item — see §12.

### 6.4 One suite set, three triggers

The same suites run under three triggers with different baselines:

| Trigger                        | Baseline                                     | Question answered                          | Consumer                      |
| ------------------------------ | -------------------------------------------- | ------------------------------------------ | ----------------------------- |
| **PR gate** (override allowed) | the profile tuple, optional single override  | "does this change / candidate break Solo?" | Solo devs + component teams   |
| **Nightly tuple validation**   | the full profile tuple, no override          | "is this pinned tuple still compatible?"   | Solo release process          |
| **Per-release artifact**       | the release's pinned tuple                   | published compatibility signal             | downstream teams (no Solo CI) |

Tuple validation (a full profile, no override) and vary-one (one override against the profile) are the
same machinery: a profile supplies the baseline; an optional single override probes a candidate.
`version.ts` also carries an `*_EDGE_VERSION` set for the "latest of everything" combination used by
[#4269](https://github.com/hiero-ledger/solo/issues/4269)'s `--edge` — the full-combination variant of
nightly validation.

## 7. Architecture

### 7.1 Test tiers

| Tier               | Contents                                                                                          | Budget       | Runs                                   |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| **Core Smoke**     | one-shot single deploy; all five components up; create account / transfer / topic; verify via mirror + k8s | <= 15 min    | always (the required gate)             |
| **Component suite** | per component (CN, mirror, explorer, relay, block) — the component's widely-used slice            | core + component <= 30 min | when that component's paths change, or on demand for a compatibility run |
| **Mini-perf**      | bounded NLG load; thresholds computed from runner mem/cpu                                          | 5–10 min     | every deploy-path PR                   |

### 7.2 Independent-verification layer

Each suite verifies through the existing clients: mirror node REST
(`src/services`-equivalent helpers already used by E2E), consensus node queries, and Kubernetes pod
state. Component suites reuse and extend the existing `RelayTest` / `ExplorerTest` verification
helpers.

### 7.3 Invocation surfaces

A compatibility run must be invokable from another repository. Mirroring how the SDK TCK ships:

1. **Reusable GitHub workflow** (`workflow_call`) — the primary path. A component repo calls it with
   `component` + `version` inputs.
2. **Container image** — for local and manual runs (the SDK TCK ships a Docker image; we provide the
   equivalent).
3. **`repository_dispatch`** — optional, from a component repo into Solo.

## 8. The compatibility run contract

### 8.1 Inputs

| Input          | Required | Meaning                                                                                  |
| -------------- | -------- | ---------------------------------------------------------------------------------------- |
| `component`    | yes      | one of `consensus-node`, `mirror-node`, `explorer`, `relay`, `block-node`                |
| `version`      | yes      | the candidate version; the harness sets the matching env var from the [§6.3](#63-the-three-names-of-each-component) map |
| `solo-version` | no       | which Solo to test against; pinned for reproducibility; default = latest release         |
| `scope`        | no       | `core` \| `core+component` (default) \| `full`                                           |

### 8.2 Semantics

The harness sets **exactly one** version environment variable (from `component` + `version`), leaves
the other four unset so they resolve to the `solo-version` baseline, deploys, and runs Core Smoke plus
the targeted component suite. Only the component-under-test differs from a known-good baseline.

### 8.3 Verdict

`pass | fail | skip`, with a per-check breakdown, decided by independent verification:

- **pass** — Solo deployed the component and the mirror node / cluster confirm the expected state.
- **fail** — behavior differs from the spec, verified against real state. A fail does **not** by
  itself assign blame: an intentional breaking change in the component means Solo must adapt. The
  TCK's job is to surface the incompatibility early.
- **skip** — a check not applicable to the requested scope.

Reporting: HTML + JSON (the repo already produces coverage/report artifacts), attached to the run.

### 8.4 Published per-release compatibility artifact

Per roadmap #199, each Solo release publishes a machine-readable TCK results artifact for its pinned
tuple. Downstream component teams consume this signal to confirm their release works against Solo
**without running Solo CI themselves**. This is the second consumption mode alongside the
run-it-yourself workflow/container of §7.3:

- **Run-it-yourself** — a team runs the reusable workflow/container against their candidate (vary-one).
- **Consume-the-signal** — a team reads the published per-release artifact for the tuple Solo shipped.

## 9. Time budget and the required gate

#4272 requires the required check to run in 15–30 minutes. The current 12-suite matrix, at 20–30 min
per suite with `max-parallel: 3`, runs well beyond that (roughly 80+ minutes wall-clock). The gate
cannot be the whole matrix. Strategy:

- **Core Smoke is the required gate** — a single curated suite within the budget.
- **Path → suite mapping** selects the relevant component suite(s) for a PR.
- **One always-running aggregator job ("TCK Gate")** fans out to the selected suites and reports a
  single status. Only the aggregator is marked required in branch protection — this avoids the trap
  where a *skipped* required matrix leg blocks merges.
- **Demote the heavy matrix** (dual-cluster, idempotency, external-DB, node-upgrade) to the existing
  nightly/extended flow (`flow-nightly-extended-tests.yaml`), not the PR gate.
- **Reuse one deployed network** across a component's checks rather than deploying per test.

## 10. Mini-performance tier

Per #4272, a 5–10 minute performance check whose limits are **calculated from current mem/cpu** rather
than hard-coded:

- Drive a bounded NLG load (reusing `performance.test.ts` / `small-memory-load.test.ts` and the
  peak-memory-snapshot work).
- Derive thresholds from runner resources: a throughput floor scaled to CPU count and a peak-memory
  ceiling scaled to available RAM.
- Fail if throughput is below the floor or peak memory exceeds the ceiling.

## 11. Implementation roadmap

1. **Generalize version parameterization at the CI boundary.** `zxc-e2e-test.yaml` accepts only
   `consensus-node-version` today. Either add the other four inputs or (simpler) have the harness set
   the single candidate env var in the job environment — the version layer already reads it.
2. **Promote explorer, relay, and a mirror-node functional slice** into first-class named suites from
   the existing verification helpers.
3. **Author the Core Smoke suite** within the 15-minute budget and wire the "TCK Gate" aggregator as
   the required check; demote the heavy matrix to nightly.
4. **Add the mini-perf tier** with calculated thresholds.
5. **Publish the invocation surfaces** — reusable workflow first, container image second.
6. **Write lightweight per-component specs** (the contract each suite verifies), enabling external
   teams and future contributors.

## 12. Open decisions

- **Tuple profile contract** — the CN, mirror, and block-node teams must agree on the profile schema
  and which axes it pins (roadmap #199 dependency). Blocks the profile-file work.
- **JDK axis mechanism** — how the JDK version is pinned and injected (via the CN image/build) needs
  definition; it is a tuple axis with no current `version.ts` flag.
- **Per-team runs, vary-one only, or also allow varying against other candidates?** This design
  assumes vary-one for attribution; the full tuple is the nightly/release check.
- **Runner strategy** — self-hosted (assumed here, given the budget and perf tier) vs GitHub-hosted.
- **Spec formality** — lightweight markdown specs per component vs letting the tests be the contract.
- **`solo-version` default** — latest release vs `main`.

## 13. References

- [hiero-ledger/roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) — roadmap driver (2026 Q3)
- [#5001](https://github.com/hiero-ledger/solo/issues/5001) — 2026 Q3 Initiatives (parent)
- [#4272](https://github.com/hiero-ledger/solo/issues/4272) — Initiative: create Solo TCK
- [#4269](https://github.com/hiero-ledger/solo/issues/4269) — `--edge` latest component versions
- [Hiero SDK TCK](https://github.com/hiero-ledger/hiero-sdk-tck) — spec-first / independent-verification reference
- [CNCF Kubernetes conformance](https://github.com/cncf/k8s-conformance) — downstream-conformance model
- `version.ts` — component version constants and env overrides
- `src/commands/flags.ts` — per-component `--*-version` flags
- `.github/workflows/support/e2e-test-matrix.json` — current E2E matrix
- `test/e2e/commands/tests/relay-test.ts`, `explorer-test.ts` — existing verification helpers
