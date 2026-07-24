# Solo TCK — Implementation Plan

**Status:** Draft · **Roadmap:** [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
· **Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
· **Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)
· **Overview:** [solo-tck-overview.md](./solo-tck-overview.md)

This document breaks the TCK initiative into concrete, filable child issues of #4272. Each entry below
is written so it can be pasted into a GitHub issue: it has scope, acceptance criteria, dependencies,
and a rough size. Sizes are relative (S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks) and assume
familiarity with the Solo E2E and CI setup.

## Phasing

| Phase                        | Goal                                                            | Issues          |
| ---------------------------- | --------------------------------------------------------------- | --------------- |
| **0 — Validate assumption**  | Prove the version env-var flows end-to-end before building on it | TCK-1           |
| **1 — Tuple foundation**     | External profile files + JDK axis — the baseline everything builds on | TCK-11, TCK-12 |
| **2 — Coverage**             | CN / mirror / block-node functional suites (explorer/relay later) | TCK-3, TCK-2    |
| **3 — Parameterization**     | Any tuple / single override injectable from CI / externally        | TCK-4           |
| **4 — Gate**                 | A fast, required Core Smoke gate within budget                     | TCK-5, TCK-6    |
| **5 — Nightly + release**    | Nightly tuple validation + published per-release artifact          | TCK-13, TCK-14  |
| **6 — Performance**          | A calculated-threshold mini-perf check                             | TCK-7           |
| **7 — External surface**     | Component teams can invoke the TCK from their own repos            | TCK-8, TCK-9    |
| **8 — Contract**             | Lightweight per-component specs                                    | TCK-10          |

> **Roadmap #199 re-prioritization.** The roadmap's tuple is `{CN × mirror × block-node × JDK}`, so
> the profile/JDK foundation (Phase 1) and CN/mirror/block-node coverage come first; **explorer and
> relay suites (TCK-2) move behind them** since they are not on the roadmap's core tuple.

## Dependency graph

```text
TCK-1 ──► TCK-11 ──► TCK-12 ──► TCK-4 ──► TCK-5 ──► TCK-6 ──► TCK-13 ──► TCK-14
              │                    │          │
              └──► TCK-3 ──► TCK-2 │          └──► TCK-7
                        │          │
                        └──► TCK-10│
TCK-4 ──► TCK-8 ──► TCK-9
```

---

## TCK-1 — Spike: verify the component version env var reaches the deployed image

**Phase 0 · Size: S · Depends on: none**

**Why.** The whole vary-one design assumes that setting a single env var (e.g. `MIRROR_NODE_VERSION`)
resolves through `version.ts` and lands on the actually-deployed pod's image tag. This is the
load-bearing assumption; validate it before building on it.

**Scope.**

- For one component (mirror node), set `MIRROR_NODE_VERSION` to a non-default value and run
  `solo one-shot single deploy` locally.
- Confirm the deployed mirror-node pod runs that exact image tag (via `kubectl` / mirror node build
  info), not the `version.ts` default.
- Repeat the check for consensus node (`CONSENSUS_NODE_VERSION` → `HEDERA_PLATFORM_VERSION`), whose
  name mapping is the trickiest.

**Acceptance criteria.**

- Documented evidence (commands + output) that the env var overrides the deployed image tag for at
  least mirror node and consensus node.
- Any component where the override does **not** flow through is filed as a follow-up bug and linked
  here.

---

## TCK-2 — Promote explorer and relay into first-class component suites

**Phase 2 · Size: M · Depends on: TCK-3 · deprioritized (not on roadmap #199's core tuple)**

**Why.** Explorer and relay have deploy-and-verify helpers (`test/e2e/commands/tests/relay-test.ts`,
`explorer-test.ts`) but no dedicated, independently-selectable gate; coverage is incidental. See design
§5.

**Scope.**

- Create `test-e2e-relay` and `test-e2e-explorer` Taskfile targets and matching test suites that
  reuse the existing `RelayTest` / `ExplorerTest` verification helpers.
- Each suite deploys its component through Solo and verifies via the mirror node / cluster (not Solo's
  own success output).
- Register both in `.github/workflows/support/e2e-test-matrix.json`.

**Acceptance criteria.**

- `task test-e2e-relay` and `task test-e2e-explorer` run standalone and pass on a clean environment.
- Each suite fails loudly if its component's pods are unhealthy or absent.
- Both appear in the PR matrix.

---

## TCK-3 — Add a mirror-node functional suite

**Phase 2 · Size: M · Depends on: TCK-1, TCK-11**

**Why.** Mirror node is only exercised incidentally (external-DB, one-shot). It needs a functional
conformance slice of its own. See design §5.

**Scope.**

- Create `test-e2e-mirror-node` covering the widely-used mirror behaviors (REST availability, account
  and transaction visibility, importer health).
- Verify strictly against the mirror node REST API and pod state.

**Acceptance criteria.**

- `task test-e2e-mirror-node` runs standalone and passes.
- Registered in the E2E matrix.

---

## TCK-4 — Parameterize the tuple at the CI boundary

**Phase 3 · Size: M · Depends on: TCK-11, TCK-12**

**Why.** `zxc-e2e-test.yaml` accepts only `consensus-node-version` today. A compatibility run must be
able to load a profile tuple and inject any single override. See design §8, §11.

**Scope.**

- Extend the reusable E2E workflow to load a profile (TCK-11) into the five component version env vars
  (`CONSENSUS_NODE_VERSION`, `MIRROR_NODE_VERSION`, `EXPLORER_VERSION`, `RELAY_VERSION`,
  `BLOCK_NODE_VERSION`) plus the JDK axis (TCK-12).
- Support overriding exactly one axis with a candidate; leave the rest at the profile baseline.
- Prefer setting env vars over adding typed inputs, since the version layer already reads env vars.

**Acceptance criteria.**

- A workflow run with, say, `MIRROR_NODE_VERSION` set deploys mirror node at that version and all other
  components at their `version.ts` defaults.
- Documented in the workflow inputs.

---

## TCK-5 — Author the Core Smoke suite

**Phase 4 · Size: M · Depends on: TCK-4**

**Why.** The required gate must be a single curated suite within the 15-minute budget (the full matrix
is ~80 min). See design §7.1, §9.

**Scope.**

- One suite: `solo one-shot single deploy`, all five components up, then create account / transfer /
  submit topic message, each verified via mirror node + cluster.
- Reuse one deployed network across the checks rather than redeploying.

**Acceptance criteria.**

- `task test-e2e-core-smoke` completes in ≤ 15 minutes on the target runner.
- Fails if any of the five components is unhealthy or if independent verification does not confirm the
  operations.

---

## TCK-6 — Wire the required "TCK Gate" aggregator + path→suite selection

**Phase 4 · Size: M · Depends on: TCK-5**

**Why.** Selective suites that skip will block merges if marked required; a single always-running
aggregator avoids that. See design §9.

**Scope.**

- Add a path→suite mapping (change to `src/commands/mirror-node.ts` selects the mirror suite, etc.).
- Add one aggregator job ("TCK Gate") that always runs, fans out to Core Smoke + the selected
  component suites, and reports a single pass/fail status.
- Update branch protection so only "TCK Gate" is required; demote the heavy matrix
  (dual-cluster, idempotency, external-DB, node-upgrade) to `flow-nightly-extended-tests.yaml`.

**Acceptance criteria.**

- A PR touching only mirror-node code runs Core Smoke + mirror suite and nothing else in the gate.
- "TCK Gate" is the single required status check; a green gate is achievable in ≤ 30 min.

---

## TCK-7 — Mini-performance tier with calculated thresholds

**Phase 6 · Size: M · Depends on: TCK-5**

**Why.** #4272 asks for a 5–10 min perf check whose limits are computed from mem/cpu, not hard-coded.
See design §10.

**Scope.**

- Drive a bounded NLG load (reuse `performance.test.ts` / `small-memory-load.test.ts` and the
  peak-memory-snapshot work).
- Compute a throughput floor from CPU count and a peak-memory ceiling from available RAM at runtime.
- Fail if throughput < floor or peak memory > ceiling.

**Acceptance criteria.**

- Runs in 5–10 min and reports the computed thresholds alongside the measured values.
- Deterministic pass/fail relative to the runner's resources.

---

## TCK-8 — Reusable compatibility-run workflow (external entry point)

**Phase 7 · Size: M · Depends on: TCK-4**

**Why.** Component teams live in other repos and must be able to invoke the TCK. See design §7.3, §8.

**Scope.**

- A `workflow_call` workflow with inputs `component`, `version`, optional `solo-version`, `scope`.
- Maps `component` + `version` to the correct env var (per the design's three-names map) and runs
  Core Smoke + that component's suite.
- Emits the `pass | fail | skip` verdict with a per-check breakdown and an HTML/JSON report artifact.

**Acceptance criteria.**

- A caller workflow (simulating a component repo) can run the TCK against a chosen version and read a
  clear verdict.
- A deliberately-broken version produces a `fail` with the failing check identified.

---

## TCK-9 — Container image for local / manual runs

**Phase 7 · Size: M · Depends on: TCK-8**

**Why.** Mirror the Hiero SDK TCK's Docker distribution so a team can run the suite without wiring CI.
See design §7.3.

**Scope.**

- Package the TCK run into a container image parameterized by `component` / `version` / `solo-version`.
- Document usage in the repo README / design docs.

**Acceptance criteria.**

- `docker run … --component mirror-node --version <v>` runs the suite and prints the verdict.

---

## TCK-10 — Lightweight per-component specs

**Phase 8 · Size: M · Depends on: TCK-3**

**Why.** A written contract per component lets external teams and future contributors understand what
"compatible" means, and keeps the suites honest. See design §11.

**Scope.**

- One short markdown spec per component under `docs/design/test/` (or a `specs/` subfolder): the
  operations covered, the expected verifications, and the pass criteria.
- Link each spec from the component's suite.

**Acceptance criteria.**

- Five specs exist, each mapped to its suite.
- A new contributor can read a spec and know what the suite guarantees.

---

## TCK-11 — Pinned-tuple profile files (external data)

**Phase 1 · Size: M · Depends on: TCK-1**

**Why.** Roadmap #199 requires the known-good tuple to ship as **external profile data Solo reads**
(e.g. `mainnet`, `testnet`), not hard-coded in `version.ts` — resolving the Hiero-neutral branding
constraint and making "bump CN" a profile edit. See design §6.2.

**Scope.**

- Define a profile file schema pinning each tuple axis (CN, mirror, block node, relay, explorer, JDK).
- Ship `mainnet` and `testnet` profiles as external data.
- Have Solo load a named profile and resolve it onto the component version env vars.

**Acceptance criteria.**

- A named profile deploys the exact pinned tuple, verified against the deployed image tags.
- Profiles live outside the source as data; adding/updating one requires no code change.
- Schema agreed with the CN, mirror, and block-node teams (see open dependency).

---

## TCK-12 — Add JDK as a tuple axis

**Phase 1 · Size: M · Depends on: TCK-1**

**Why.** Roadmap #199's tuple is `{CN × mirror × block-node × JDK}` — JDK is a first-class axis with
no current `version.ts` flag or env var. See design §6.3.

**Scope.**

- Define how the JDK version is pinned and injected (via the consensus-node image/build).
- Add JDK to the profile schema (TCK-11) and to the parameterization path (TCK-4).

**Acceptance criteria.**

- A profile can pin a JDK version and the deployed consensus node runs on it.
- The mechanism is documented in the design doc's three-names map.

---

## TCK-13 — Nightly tuple validation

**Phase 5 · Size: S · Depends on: TCK-6**

**Why.** Roadmap #199 wants the full pinned tuple validated nightly to fail fast on incompatible
combinations before they block a release. See design §6.4, §9.

**Scope.**

- Add a scheduled job (in `flow-nightly-extended-tests.yaml`) that runs Core Smoke + component suites
  against each profile's full tuple, no override.
- Surface failures with the offending tuple.

**Acceptance criteria.**

- Nightly run reports pass/fail per profile tuple.
- A regression in a pinned tuple is caught before the next release.

---

## TCK-14 — Publish per-release compatibility artifact

**Phase 5 · Size: M · Depends on: TCK-6**

**Why.** Roadmap #199 wants each Solo release to publish a machine-readable compatibility signal so
downstream teams can consume it **without running Solo CI themselves**. See design §8.4.

**Scope.**

- On release, emit a machine-readable artifact (JSON) recording the pinned tuple and its pass/fail
  verdict per check.
- Attach it to the Solo release and document how downstream teams consume it.

**Acceptance criteria.**

- Every release carries a compatibility artifact for its pinned tuple.
- A component team can read the artifact to confirm their version shipped in a passing tuple.

---

## Suggested issue metadata

- **Parent:** all issues are children of #4272.
- **Labels:** `Testing Improvements`, plus `P1-💎` for the gate path (TCK-1 → TCK-6) and `P2` for the
  external surface and specs.
- **Milestone:** align Phase 4 (the required gate) with the milestone that unblocks
  [#4269](https://github.com/hiero-ledger/solo/issues/4269); Phase 5 (nightly + release artifact)
  satisfies roadmap #199's "Done When" (release-cut compatibility signal).
- **Dependency:** the CN, mirror, and block-node teams must agree on the tuple profile contract
  (roadmap #199) before TCK-11 can land.
