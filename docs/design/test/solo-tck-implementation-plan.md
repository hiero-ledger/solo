# Solo TCK — Implementation Plan

**Status:** Draft (PRD v0.2) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) ·
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

Filable child issues of #4272, mostly extraction and decoupling of `test/e2e`. Rationale lives in the
design doc; this file carries scope and acceptance only. Sizes: **S** ≈ 1–2 days, **M** ≈ 3–5 days,
**L** ≈ 1–2 weeks.

| Phase                    | Goal                                               | Issues                           |
| ------------------------ | -------------------------------------------------- | -------------------------------- |
| **0 — Decisions**        | Settle what gates everything; write the contract   | TCK-D1, D2 (decided), D3, D4, D5 |
| **1 — Foundations**      | Branch-build flow + evidence-based suite selection | TCK-1, TCK-2                     |
| **2 — Kit**              | Runner + core suites + memory smoke                | TCK-3, TCK-4, TCK-5              |
| **3 — Distribution**     | Synchronous invocation surface + published record  | TCK-6, TCK-13                    |
| **4 — Consumer rollout** | Wire into each consumer's CI and document it       | TCK-7 … TCK-12, TCK-14           |

```text
TCK-D1 ─┐
TCK-D3 ─┼─► TCK-1 ─► TCK-3 ─► TCK-4 ─► TCK-6 ─► TCK-7…TCK-12
TCK-D5 ─┘        TCK-2 ─► TCK-4        TCK-5 ─► TCK-6 ─► TCK-14
                                       TCK-4 ─► TCK-13

TCK-D2 ── decided (in-repo); its release-mechanism obligation lands in TCK-6
TCK-D4 ── the written contract; TCK-4's suites cite its clauses, and the name depends on it
```

## Phase 0 — Decisions

**TCK-D1 — Version-resolution model · S.** Options: (a) latest-stable — current but non-reproducible;
(b) hybrid — candidate provided, others latest-stable but overridable; (c) edge — catches bleeding-edge
breaks, noisy; (d) pinned-tuple manifests (roadmap#199) — reproducible, needs upkeep. **Recommend (b) for PR
runs + (d) for nightly/release**, pending ratification with Keith/leadership. Also settle design §3's three
constraints: not "profiles", the five-source precedence order, and emitting the _resolved_ tuple.
**Done when.** Decision recorded, design §3 updated, all three specified.

**TCK-D2 — Repo home · S · DECIDED: inside the Solo repo.** Alternatives were a standalone
`hiero-ledger/solo-tck` and per-consumer copies (rejected: N copies). In-repo wins because the harness
cannot move without a rewrite (design §2); the precedent for exposing it as a versioned action is
[TSC#298](https://github.com/hiero-ledger/tsc/issues/298) — one repo, several Marketplace actions from
subdirectories behind a stub root `action.yml`. **Obligation:** the best argument for standalone was
consumption-time pinning, so **the kit must be released on its own tags**, or in-repo has the standalone
costs with none of the benefits. (`hiero-sdk-tck` shipped 12 minor releases in a year, fully decoupled from
any SDK.) **Done when.** That release/tagging mechanism is specified and implemented before the first
consumer is onboarded (TCK-6).

**TCK-D3 — Version variables · S.** The **kit** version and the **Solo** version it tests against are
conflated and need opposite answers: pin the kit independently, but **accept the caller's Solo version** —
consumers already pin Solo five ways (design §4), a sixth will drift against all of them, and the question
they care about is _"does my branch work with the Solo version I actually use?"_ **Done when.** Consumers
know which variable sets which; the default Solo version is tied to the support window in
[#3608](https://github.com/hiero-ledger/solo/issues/3608).

**TCK-D4 — Write the Solo Deployment Contract · M · blocks the name "TCK".** Scope:
`docs/design/test/solo-deployment-contract.md`, versioned — chart structure and location, required config
keys, labels, Helm-values schema, image entrypoints, env vars, health endpoints, CLI behaviour. v0.1 with
ten real clauses beats a complete document later; format modelled on `hiero-sdk-tck`'s
`docs/test-specifications/`. **Done when.** Contract merged; every pr-core suite cites the clause it
verifies; the clause-change approval process is recorded.

**TCK-D5 — Make the Solo-side interdependency boundary real · M.** Scope: a declarative constraint registry
modelled on `component-upgrade-rules.ts` + `resources/component-upgrade-migrations.json` (external JSON,
versioned boundaries, `reason` strings, safe fallback) — a sibling `component-compatibility.json` evaluated
against the resolved tuple before deploy, then migrate the ad-hoc gates into it. **Done when.** A tuple can
be validated without deploying it; ≥3 existing gates migrated; a documented failure mode for constraints the
registry cannot express.

## Phases 1–4 — Engineering

| Issue                                             | Scope                                                                                                                                                                                                                                                                                                            | Done when                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TCK-1** Branch-build flow<br>M · after D1       | Build a branch → `kind load` → deploy through Solo with that image; confirm the deployed pod runs the built image, not a registry default. CN and MN first. Both mechanisms are at zero today (design §2).                                                                                                       | Documented evidence a branch build reaches the deployed pod for ≥2 components; gaps filed.                                                               |
| **TCK-2** Suite selection<br>M                    | Confirm design §5's `MINIMUM_*` findings rather than rediscover them, extend against CN/MN/BN/Relay issue history, and rank the pr-core list with what each entry asserts. Many past breakages had **no test at all**.                                                                                           | A prioritised list, each entry citing its motivating issue or gate, plus an explicit uncovered list.                                                     |
| **TCK-3** The runner<br>L · after 1               | From `test/e2e`: a subprocess `solo` adapter and `kubectl`+HTTP probe layer for the distributed path; parametrise on candidate images + `solo-version` instead of `version.ts`. **Scope the port** — see design §2.                                                                                              | Deploys and verifies a network via subprocess `solo` with no Solo internal imports; in-process suites still run under coverage.                          |
| **TCK-4** Core topology suites<br>M · after 2, 3  | `single` (~5 min) + `standard` (~15 min): bring-up → pod-ready → HCS smoke → mirror catchup → JSON-RPC → clean teardown, one network per topology. Assertions cite TCK-D4 clauses; pod-readiness alone is insufficient ([#5875](https://github.com/hiero-ledger/solo/issues/5875)).                              | Both pass within the ~20 min budget and fail loudly on any unhealthy channel.                                                                            |
| **TCK-5** Memory smoke<br>S · after 3             | Reuse the existing perf suite's load types at ~1 min each, reported as a load-path smoke, not a TPS/latency signal (design §5).                                                                                                                                                                                  | Reports mem/cpu per load type against Solo's resource requirements, caveat stated in the output.                                                         |
| **TCK-6** Distribution<br>M · after 4, D2, D3     | Versioned composite Action + Docker image (design §4); no nesting Solo inside a CI container. **Carries TCK-D2's obligation**: own release tags and semver.                                                                                                                                                      | A consumer workflow blocks on a synchronous pass/fail; the kit pins at a version that is not a Solo version; the Docker entrypoint runs the same suites. |
| **TCK-6a** Reusable workflow<br>optional          | Ours would be the org's first. POC: minimal `workflow_call` repo → call from a second repo → confirm synchronous status reaches the caller PR → verify secret/permission passing. Ask Roger/Andrew/Nathan first.                                                                                                 | POC answers the Actions-policy and token-scope unknowns, or the path is dropped.                                                                         |
| **TCK-13** Conformance record<br>M · after 4      | A git-tracked entry per `(Solo version, resolved tuple, kit version, date, verdict)` modelled on `cncf/k8s-conformance`; then extend publication beyond the README "Current Releases" table (design §5).                                                                                                         | A machine-readable record exists for ≥1 Solo release, reachable without running CI; the published matrix covers all five components.                     |
| **TCK-12** Shrink Solo's matrix<br>M · after 7–11 | Reduce `e2e-test-matrix.json` toward unit + integration + one-shot smoke; move dropped component coverage to nightly.                                                                                                                                                                                            | Each drop **earned per consumer** — only once equivalent coverage demonstrably runs upstream, with the mapping kept explicit.                            |
| **TCK-14** User-facing guide<br>S · after 6       | Hand-authored guide in `solo-docs/content/en/docs/…`: adding the kit to your CI, inputs, reading a verdict and its failure class, pinning the kit, where the record lives. Needs a new top-level section — every existing one addresses someone _deploying_ with Solo, not a team _whose software Solo deploys_. | Merged in solo-docs and live on solo.hiero.org. The site rebuilds only on a Solo release dispatch, so time it to a release or request a manual dispatch. |

## TCK-7 … TCK-11 — Consumer rollout · M each · after TCK-6

An **additional** gate; it does not replace a consumer's existing Solo tests, which cover behaviour outside
its scope. Replacing duplicated _bring-up orchestration_ is fine; retiring now-redundant _tests_ is a
best-case per-team follow-up. **Done when (each):** the consumer gates on a synchronous Solo-compat signal
and duplicated orchestration is removed where it existed.

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
**Confirm first:** `hiero-solo-action` is maintained outside the core Solo CI group and used by SDK repos
rather than the component teams, yet the design assumes our team updates it to accept a built component
image. Confirm write access and release ownership. Note TCK-12's benefit is contingent on all five
adoptions, two of which run Solo only on schedules.

## Issue metadata

Parent **#4272**; labels `Testing Improvements`, `P1-💎`. File with the native sub-issue link, not body
references. TCK-D1/D3/D4/D5 as **Ready**; the rest **Backlog** until their blockers clear.
