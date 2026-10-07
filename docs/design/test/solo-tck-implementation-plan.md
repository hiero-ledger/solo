# Solo TCK — Implementation Plan

**Status:** Draft (PRD v0.2) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) ·
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

Filable child issues of #4272. Rationale lives in the design doc; this file carries scope and acceptance
only. **S** ≈ 1–2 days, **M** ≈ 3–5 days, **L** ≈ 1–2 weeks.

| Phase                    | Issues                           | Blocked by             |
| ------------------------ | -------------------------------- | ---------------------- |
| **0 — Decisions**        | TCK-D1, D2 (decided), D3, D4, D5 | —                      |
| **1 — Foundations**      | TCK-1, TCK-2                     | D1                     |
| **2 — Kit**              | TCK-3, TCK-4, TCK-5              | TCK-1, TCK-2           |
| **3 — Distribution**     | TCK-6, TCK-13                    | TCK-4, D2, D3          |
| **4 — Consumer rollout** | TCK-7 … TCK-12, TCK-14           | TCK-6; TCK-12 on 7..11 |

## Phase 0 — Decisions

**TCK-D1 — Version-resolution model · S.** Options: (a) latest-stable — non-reproducible; (b) hybrid —
candidate provided, others latest-stable but overridable; (c) edge — noisy; (d) pinned-tuple manifests
(roadmap#199) — needs upkeep. **Recommend (b) for PR runs + (d) for nightly/release**, pending ratification
with Keith/leadership. Also settle design §3's three constraints: not "profiles", the five-source precedence
order, and emitting the _resolved_ tuple. **Done when:** decision recorded, design §3 updated, all three
specified.

**TCK-D2 — Repo home · S · DECIDED: inside the Solo repo,** because the harness cannot move without a
rewrite (design §2); standalone and per-consumer copies were the rejected alternatives. **Obligation:** the
best argument for standalone was consumption-time pinning, so **the kit must be released on its own tags**,
or in-repo carries the standalone costs with none of the benefits. **Done when:** that release/tagging
mechanism is specified and implemented before the first consumer is onboarded (TCK-6).

**TCK-D3 — Version variables · S.** The **kit** version and the **Solo** version it tests against need
opposite answers: pin the kit independently, but **accept the caller's Solo version** — a sixth pin drifts
against the five that already exist (design §4). **Done when:** consumers know which variable sets which,
and the default Solo version is tied to the support window in
[#3608](https://github.com/hiero-ledger/solo/issues/3608).

**TCK-D4 — Write the Solo Deployment Contract · M · blocks the name "TCK".** Scope:
`docs/design/test/solo-deployment-contract.md`, versioned — chart structure and location, required config
keys, labels, Helm-values schema, image entrypoints, env vars, health endpoints, CLI behaviour. v0.1 with
ten real clauses beats a complete document later; format modelled on `hiero-sdk-tck`'s
`docs/test-specifications/`. **Done when:** merged, every pr-core suite cites the clause it verifies, and
the clause-change approval process is recorded.

**TCK-D5 — Make the Solo-side interdependency boundary real · M.** Scope: a declarative constraint registry
modelled on `component-upgrade-rules.ts` + `resources/component-upgrade-migrations.json` — a sibling
`component-compatibility.json` evaluated against the resolved tuple before deploy, then migrate the ad-hoc
gates into it. **Done when:** a tuple can be validated without deploying it, ≥3 existing gates are migrated,
and constraints the registry cannot express have a documented failure mode.

## Phases 1–4 — Engineering

| Issue                                             | Scope                                                                                                                                                                                                                                                                         | Done when                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TCK-1** Branch-build flow<br>M · after D1       | Build a branch → `kind load` → deploy through Solo with that image. CN and MN first. Gates four of five components (design §2).                                                                                                                                               | The deployed pod demonstrably runs the built image, not a registry default, for ≥2 components.                                                             |
| **TCK-2** Suite selection<br>M                    | Confirm design §7's `MINIMUM_*` findings, extend against CN/MN/BN/Relay issue history, rank the pr-core list. Many past breakages had **no test at all**.                                                                                                                     | A prioritised list, each entry citing its motivating issue or gate, plus an explicit uncovered list.                                                       |
| **TCK-3** The runner<br>L · after 1               | A subprocess `solo` adapter and `kubectl`+HTTP probe layer for the distributed path; parametrise on candidate images + `solo-version` instead of `version.ts`. **Scope the port** per design §2.                                                                              | Verifies a network via subprocess `solo` with no Solo internal imports; in-process suites still run under coverage.                                        |
| **TCK-4** Core topology suites<br>M · after 2, 3  | `single` (~5 min) + `standard` (~15 min), one network per topology. Assertions cite TCK-D4 clauses.                                                                                                                                                                           | Both pass within the ~20 min budget and fail on any unhealthy channel, not just pod-readiness ([#5875](https://github.com/hiero-ledger/solo/issues/5875)). |
| **TCK-5** Memory smoke<br>S · after 3             | The existing perf suite's load types at ~1 min each (design §7).                                                                                                                                                                                                              | Reports mem/cpu per load type against Solo's resource requirements, with the "not a TPS signal" caveat in the output.                                      |
| **TCK-6** Distribution<br>M · after 4, D2, D3     | Versioned composite Action + Docker image (design §5). **Carries TCK-D2's obligation**: own release tags and semver.                                                                                                                                                          | A consumer workflow blocks on a synchronous pass/fail, and the kit pins at a version that is not a Solo version.                                           |
| **TCK-6a** Reusable workflow<br>optional          | POC only: minimal `workflow_call` repo → call from a second repo → confirm synchronous status reaches the caller PR → verify secret/permission passing. Ask Roger/Andrew/Nathan first.                                                                                        | The Actions-policy and token-scope unknowns are answered, or the path is dropped.                                                                          |
| **TCK-13** Conformance record<br>M · after 4      | A git-tracked entry per `(Solo version, resolved tuple, kit version, date, verdict)`; extend publication beyond the README "Current Releases" table (design §6).                                                                                                              | A record exists for ≥1 Solo release, reachable without running CI, covering all five components.                                                           |
| **TCK-12** Shrink Solo's matrix<br>M · after 7–11 | Reduce `e2e-test-matrix.json` toward unit + integration + one-shot smoke; move dropped component coverage to nightly.                                                                                                                                                         | Each drop **earned per consumer** — only once equivalent coverage demonstrably runs upstream, mapping kept explicit.                                       |
| **TCK-14** User-facing guide<br>S · after 6       | A guide in `solo-docs/content/en/docs/…`: adding the kit to your CI, inputs, reading a verdict and its failure class, pinning the kit. Needs a new top-level section — the existing ones all address someone _deploying_ with Solo, not a team _whose software Solo deploys_. | Live on solo.hiero.org. The site rebuilds only on a Solo release dispatch, so time it accordingly.                                                         |

## TCK-7 … TCK-11 — Consumer rollout · M each · after TCK-6

Replacing duplicated _bring-up orchestration_ is in scope; retiring now-redundant _tests_ is a per-team
follow-up. **Done when (each):** the consumer gates on a synchronous Solo-compat signal and duplicated
orchestration is removed where it existed.

- **TCK-7 — CN:** add a panel to the XTS suite. CN runs Solo 3-hourly, **not** on PR checks, so a PR gate is
  a separate conversation; CN's panels build CN locally, which the kit does not replace.
- **TCK-8 — MN:** replace the inline orchestration in `acceptance.yaml` with one kit call; preserve the
  RECORD/BLOCK stream matrix as an input.
- **TCK-9 — BN:** additive job. BN runs Solo daily/weekend/RC and on tag push with no Solo in PR checks, so
  a PR-blocking job is a genuine addition to negotiate.
- **TCK-10 — Relay:** replace the duplicated bring-up across acceptance/conformity workflows.
- **TCK-11 — JS SDK:** **best first pilot** — `hiero-sdk-tck`'s `js_compatibility.yml` already stands up its
  network with `hiero-solo-action@v0.19.0` and a hand-pinned `solo-version`.

_(Explorer runs no Solo today, so any Explorer integration is entirely new CI — scope it separately.)_
Note TCK-12's benefit is contingent on all five adoptions, two of which run Solo only on schedules.

## Issue metadata

Parent **#4272**; labels `Testing Improvements`, `P1-💎`. File with the native sub-issue link, not body
references. TCK-D1/D3/D4/D5 as **Ready**; the rest **Backlog** until their blockers clear.
