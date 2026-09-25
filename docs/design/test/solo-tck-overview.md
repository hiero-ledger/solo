# Solo TCK — Overview

**Status:** Draft (aligned to Keith's PRD v0.2) · **Roadmap:** [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
· **Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
· **Detailed design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

## What it is

A compatibility kit, owned by the Solo team, answering one question about a candidate component build:

> **Does this build deploy cleanly via a supported Solo release and produce a functional network?**

It judges Solo as a black box — observable outputs only, never Solo's own success message.

## Where it runs

In each component's own CI against its branch build: at PR time where that team already runs Solo per PR
(Mirror Node, Relay), otherwise on their existing schedule (CN 3-hourly, Block Node daily/weekly). It
**augments** their current Solo orchestration rather than replacing it — every consumer runs Solo to host
its own unreleased build, which a compatibility kit does not substitute for.

Consumers: **CN, Mirror Node, Block Node, JSON-RPC Relay**, the **JS SDK**, and **Solo itself**. The
Explorer _UI_ is out of scope; its **server API is in scope** as a way to confirm Explorer reaches the
mirror node. Explorer runs no Solo today, so that integration is entirely new CI.

## Why

A component PR can break Solo's deployment contract, pass its own CI, merge, and ship — Solo finds out
later when bumping the pin. The signal is in the wrong repo at the wrong time.

## Decided

**The kit lives in the Solo repo**, released as a versioned action the way `solo-build-actions` exposes its
per-component actions. This keeps direct reuse of the `test/e2e` harness, which cannot move without a
rewrite. See TCK-D2 — including the obligation it carries: the kit gets its own release tags, so consumers
pin the kit rather than the Solo release carrying it.

## Open

- **Version resolution.** What versions do the _non-candidate_ components use? Keith's PRD says
  latest-stable/hybrid; roadmap#199 says pinned tuples. **The two sources disagree and must be reconciled
  first.** TCK-D1 recommends hybrid for PR-time plus a pinned tuple for release/nightly.
- **There is no written contract to conform to.** The design calls the Solo compatibility contract
  "implicit". Until it is written down (TCK-D4) this is an integration gate, not a TCK.

See the [detailed design](./solo-tck-conformance-gate.md) for the run contract, tiers, and full open list.
