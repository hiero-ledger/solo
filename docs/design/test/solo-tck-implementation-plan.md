# Solo TCK — Implementation Plan

**Status:** Draft (aligned to Keith's PRD v0.2) · **Roadmap:** [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
· **Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
· **Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

Filable child issues of #4272. Mostly extraction and decoupling of `test/e2e`, though the parts that must
run out-of-process are a real port, not a relabelling (design §6.1). Several decisions gate the engineering
work. Sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks.

## Phasing

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

---

## TCK-D1 — Version-resolution model (PRD vs roadmap#199)

**Phase 0 · S (decision)**

**Options.** (a) latest-stable — always current, non-reproducible. (b) hybrid — candidate provided, others
latest-stable but overridable; attributable, a few more inputs. (c) edge — very latest of each; catches
bleeding-edge breaks, noisy. (d) pinned tuple manifests (roadmap#199) — reproducible, good for release
gating, needs upkeep.

**Recommendation. (b) for PR runs + (d) for nightly/release** — different questions, and they compose.
**Pending ratification with Keith/leadership.**

Must also settle: **don't call them "profiles"** (collides with `ProfileManager` / `--profile`, meaning
resource-sizing presets); **state the precedence order** across the five sources; and **emit the resolved
tuple**, since both edge resolvers fall back silently to static pins on network failure. Design §6.3.

**Done when.** Decision recorded; §6.3 updated; naming, precedence and tuple emission specified.

---

## TCK-D2 — Repo home — **DECIDED: inside the Solo repo**

**Phase 0 · S · Status: decided**

**Options.** (a) standalone `hiero-ledger/solo-tck` — independent semver, clean boundary, new-repo setup.
(b) inside the Solo repo — direct `test/e2e` reuse, always in sync. (c) per consumer — rejected, N copies.

**Decision: (b)**, exposed as a versioned action the way `solo-build-actions` exposes its per-component
actions.

**Why.** The harness cannot move without a rewrite: Solo's e2e suites call `main(argv)` in-process at ~100
call sites with zero subprocess spawns, so relocating forfeits the coverage instrumentation
`zxc-code-analysis.yaml`, c8, CodeCov and Codacy depend on; and about half the e2e files use the typed
Kubernetes client, with the whole `test/e2e/integration/` tree testing Solo's own libraries, which have no
CLI surface at all.

**Precedent.** [TSC#298](https://github.com/hiero-ledger/tsc/issues/298) established that one repo can
expose several Marketplace actions from subdirectories behind a stub root `action.yml` — what collapsed the
five `solo-build-*-action` repos into one.

**Obligation.** The best argument for (a) was consumption-time pinning. Being in-repo does not excuse
forfeiting it: **the kit must be released on its own tags** so consumers pin the kit, not the Solo release
carrying it. Otherwise (b) has (a)'s costs with none of its benefits. (`hiero-sdk-tck` shipped 12 minor
releases in a year, fully decoupled from any SDK.)

**Done when.** The independent release/tagging mechanism is specified and implemented before the first
consumer is onboarded (TCK-6).

---

## TCK-D3 — Version variables

**Phase 0 · S (decision)**

Two variables are conflated: the **kit** version and the **Solo** version it tests against. They need
opposite answers.

**Recommendation.** Pin the kit independently (per TCK-D2), but **accept the caller's Solo version**.
Consumers already pin Solo five ways — CN `.citr-env` v0.87.1, MN `v0.88.1` hardcoded twice, BN input
default `0.88.1`, Relay on the deprecated `@hashgraph/solo@0.85.0`, `hiero-solo-action` default `0.88.0`. A
sixth pin will drift against all of them, and the question a consumer cares about is _"does my branch work
with the Solo version I actually use?"_

**Done when.** Consumers know which variable sets the kit and which sets Solo; the default Solo version is
tied to the support window in [#3608](https://github.com/hiero-ledger/solo/issues/3608).

---

## TCK-D4 — Write the Solo Deployment Contract

**Phase 0 · M · Blocks: the name "TCK"**

**Why.** A conformance kit needs a written contract to conform to; the design currently calls it
_implicit_. Every established TCK pairs the suite with a specification, and it is the first thing an
external team asks for.

**Scope.** `docs/design/test/solo-deployment-contract.md`, versioned: chart structure and location,
required config keys, labels, Helm-values schema, image entrypoints, env vars, health endpoints, CLI
behaviour. v0.1 with ten real clauses beats a complete document later. Format modelled on
`hiero-sdk-tck`'s `docs/test-specifications/` — clause tables with an `Implemented (Y/N)` column.

**Done when.** Contract merged; every pr-core suite cites the clause it verifies; the approval process for
a clause change is recorded.

---

## TCK-D5 — Make the Solo-side interdependency boundary real

**Phase 0 · M**

**Why.** The design asserts that _"CN X requires BN Y"_ belongs inside Solo, but **Solo cannot express such
a constraint today** — every gate is unary, scattered across six files, enforcement-only, so nothing can
ask _"is this tuple valid?"_ without deploying it. Left unaddressed the burden falls back on the kit.

**Scope.** A declarative constraint registry modelled on the proven `component-upgrade-rules.ts` +
`resources/component-upgrade-migrations.json` (external JSON, versioned boundaries, `reason` strings, safe
fallback): a sibling `component-compatibility.json` evaluated against the resolved tuple before deploy.
Then migrate existing ad-hoc gates into it.

**Done when.** A tuple can be validated without deploying it; ≥3 existing gates migrated; a documented
failure mode for constraints the registry cannot express.

---

## TCK-1 — Branch-build flow

**Phase 1 · M · Depends on: TCK-D1**

**Why.** The candidate is a branch build, not a pinned release. Interim mechanism
[#5021](https://github.com/hiero-ledger/solo/issues/5021); end state `solo-build-actions` →
`hiero-solo-action` → kit. **Both are at zero today** — `solo-build-actions` is an empty repo, #5021 has
not started, and only CN has a local-build path (a JAR side-load, not an image swap). MN and Relay branch
builds are not deployable at all, so this gates the kit's core use case for four of five components.

**Scope.** Build a branch → `kind load` → deploy through Solo with that image; confirm the deployed pod
runs the built image, not a registry default. CN and MN first.

**Done when.** Documented evidence a branch build reaches the deployed pod for ≥2 components; gaps filed.

---

## TCK-2 — Evidence-based suite selection

**Phase 1 · M**

**Why.** Which suites gate a PR must be grounded in what actually breaks Solo.

**Start from the evidence that exists.** `version.ts`'s `MINIMUM_*` constants are a codified changelog of
every component break Solo has absorbed (design §8 tabulates them). Three findings to confirm rather than
rediscover: Mirror Node breaks most often; Explorer and Relay have no `MINIMUM_*` gates and their failures
were Solo-side plumbing caught by pod-readiness; the highest-value category is cross-component.

**Scope.** Confirm and extend against CN/MN/BN/Relay issue history; produce the ranked pr-core list and
what each must assert. A meaningful fraction of historical breakages were caught by **no test at all**, so
the ranking must also say what is uncovered.

**Done when.** A prioritised suite list, each entry citing the issue or gate motivating it, plus an
explicit known-uncovered list.

---

## TCK-3 — The runner

**Phase 2 · L · Depends on: TCK-1**

**Why.** The distributed entry point drives `solo` out-of-process, decoupled from Solo internals.

**Scope.** From `test/e2e`: a subprocess `solo` adapter and probe layer (`kubectl` + HTTP) for the
externally distributed path; parametrise on candidate images + `solo-version` instead of reading
`version.ts`; reuse the existing command wrappers. **Scope the port deliberately** — in-repo suites that
rely on the typed Kubernetes client or test Solo's own libraries stay in-process (design §6.1). A blanket
`k8`→`kubectl` rewrite is the open-ended version and is not what this issue buys.

**Done when.** The runner deploys and verifies a network via subprocess `solo` with no Solo internal
imports, and the in-process suites still run under coverage.

---

## TCK-4 — Core topology suites

**Phase 2 · M · Depends on: TCK-2, TCK-3**

**Why.** The pr-core signal: `single` (~5 min) and `standard` (~15 min).

**Scope.** Bring-up → pod-ready probes → HCS smoke → mirror catchup → JSON-RPC health → clean teardown.
Reuse one deployed network across a topology's checks. Assertions must cite TCK-D4 clauses. Pod-readiness
alone is insufficient — see the undersized-PVC false pass
([#5875](https://github.com/hiero-ledger/solo/issues/5875)).

**Done when.** `single` + `standard` pass within the ~20 min budget and fail loudly on any unhealthy
channel.

---

## TCK-5 — Memory-footprint smoke

**Phase 2 · S · Depends on: TCK-3**

**Scope.** Reuse the load types the existing perf suite exercises (several at ~5 min each), run each ~1
minute. **Report it as a smoke test that the load path works, not a TPS/latency signal** — at 1 minute the
fixed overheads (60 s warmup, 30 s cooldown, ~35 s RTT probe) dominate, and the existing memory gate is
calibrated on sustained load. Design §9.

**Done when.** Reports mem/cpu per load type against Solo's resource requirements, with the caveat stated
in the output.

---

## TCK-6 — Distribution

**Phase 3 · M · Depends on: TCK-4, TCK-D2, TCK-D3**

**Scope.** Package as a **versioned composite Action** — the org's proven pattern (`hiero-solo-action`: 24
releases, ~11 consumer repos) — distributed from the Solo repo as a subdirectory action behind a stub root
`action.yml` per TSC#298. Plus a **Docker image** for local and non-GitHub-Actions runs. Do **not** nest
Solo inside a CI container. **Carries TCK-D2's obligation**: own release tags and semver.

**Done when.** A consumer workflow blocks on a synchronous pass/fail; the kit is installable at a pinned
version that is not a Solo version; the Docker entrypoint runs the same suites.

**TCK-6a (optional) — cross-repo reusable workflow.** No hiero-ledger repo uses one today, so this would be
the org's first, with Actions-policy and token-scope unknowns. An enhancement, not the critical path. POC:
minimal `workflow_call` repo → call from a second repo → confirm synchronous status reaches the caller PR →
verify secret/permission passing. Ask Roger/Andrew/Nathan first.

---

## TCK-7 … TCK-11 — Consumer rollout

**Phase 4 · M each · Depends on: TCK-6**

Added as an **additional** gate; it does not replace a consumer's existing Solo tests, which cover
behaviour outside its scope. Replacing duplicated _bring-up orchestration_ is fine; retiring now-redundant
_tests_ is a best-case per-team follow-up.

- **TCK-7 — CN:** add a panel to the XTS suite. CN runs Solo 3-hourly, **not** on PR checks; adding a PR
  gate is a separate conversation. CN's panels build CN locally, which the kit does not replace.
- **TCK-8 — MN:** replace the inline orchestration in `acceptance.yaml` with one kit call; preserve the
  RECORD/BLOCK stream matrix as an input.
- **TCK-9 — BN:** additive job. BN runs Solo daily/weekend/RC and on tag push with no Solo in PR checks, so
  a PR-blocking job is a genuine addition to negotiate.
- **TCK-10 — Relay:** replace the duplicated bring-up across acceptance/conformity workflows.
- **TCK-11 — JS SDK:** **best first pilot** — `hiero-sdk-tck`'s `js_compatibility.yml` already stands up
  its network with `hiero-solo-action@v0.19.0` and a hand-pinned `solo-version`, so it is the shortest path
  from duplication to a kit call.

_(Explorer runs no Solo today, so any Explorer integration is entirely new CI — scope it separately.)_

**Confirm before this phase:** `hiero-solo-action` is maintained outside the core Solo CI group and used by
SDK repos rather than the component teams. The design assumes our team updates it to accept a built
component image — confirm write access and release ownership first.

**Done when (each).** The consumer gates on a synchronous Solo-compat signal; duplicated orchestration
removed where it existed.

---

## TCK-12 — Shrink Solo's own per-PR matrix

**Phase 4 · M · Depends on: TCK-7 … TCK-11**

**Scope.** Reduce `e2e-test-matrix.json` toward unit + integration + one-shot smoke; move dropped
component-coverage suites to Solo's nightly CI.

**Risk — contingent on five other teams.** The benefit only materialises once TCK-7…11 are adopted, each
requiring another team to accept a gate they do not have today; two of four run Solo only on schedules and
Explorer not at all. Treat the reduction as an outcome **earned per consumer**: drop a Solo suite only once
equivalent coverage demonstrably runs upstream, and keep the mapping explicit so nothing is retired on the
assumption it is covered elsewhere.

---

## TCK-13 — Publish the conformance record

**Phase 3 · M · Depends on: TCK-4**

**Why.** roadmap#199 asks for a results artifact per Solo release so teams get _"a compatibility signal
without running Solo CI themselves"_. Without it a consumer's only access to the signal is a CI run — the
substance of the "Solo CI workflows as the TCK" objection.

**Scope.** A git-tracked record, one entry per `(Solo version, resolved tuple, kit version, date,
verdict)`, modelled on `cncf/k8s-conformance`. Then extend the publication channel: the only compatibility
claim published today is the README "Current Releases" table, which has a Consensus Node column and nothing
else and reaches the site through a literal-string scrape.

**Done when.** A machine-readable record exists for ≥1 Solo release and is reachable without running CI;
the published matrix covers all five components.

---

## TCK-14 — User-facing guide

**Phase 4 · S · Depends on: TCK-6**

**Why.** The audience is other teams and they have no published entry point. `docs/design/` is never synced
to the docs site, and the Solo→solo-docs pipeline only carries generated CLI help and error pages — a kit
shipped as an action or container produces nothing for it to harvest.

**Scope.** A hand-authored guide in `solo-docs/content/en/docs/…`: adding the kit to your CI, the inputs,
reading a verdict and its failure class, pinning the kit version, where the record lives. Needs a new
top-level section — every existing one addresses someone _deploying_ with Solo, not a team _whose software
Solo deploys_.

**Done when.** Merged in solo-docs and live on solo.hiero.org. The site rebuilds only on a Solo release
dispatch, so time it to a release or request a manual dispatch.

## Suggested issue metadata

Parent **#4272**; labels `Testing Improvements`, `P1-💎`. File with the native sub-issue link, not body
references. TCK-D1/D3/D4/D5 as **Ready**; the rest **Backlog** until their blockers clear.
