# Solo TCK — Overview

**Status:** Draft (PRD v0.2) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) ·
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md) ·
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md)

A compatibility kit, owned by the Solo team, answering one question about a candidate component build:

> **Does this build deploy cleanly via a supported Solo release and produce a functional network?**

**Why.** A component PR can break Solo's deployment contract, pass its own CI, merge, and ship; Solo finds
out later when bumping the pin. The signal is in the wrong repo at the wrong time.

**Where it runs.** In each component's own CI against its branch build — at PR time where that team already
runs Solo per PR (Mirror Node, Relay), otherwise on their existing schedule (CN 3-hourly, Block Node
daily/weekly). It **augments** their current Solo orchestration rather than replacing it. Consumers: **CN,
Mirror Node, Block Node, JSON-RPC Relay**, the **JS SDK**, and **Solo itself**. The Explorer _UI_ is out of
scope; its **server API is in scope**, and since Explorer runs no Solo today that is entirely new CI.

**Decided.** The kit lives in the Solo repo, released as a versioned action, keeping direct reuse of the
`test/e2e` harness — which cannot move without a rewrite. This carries an obligation (TCK-D2): the kit gets
its own release tags, so consumers pin the kit rather than the Solo release carrying it.

**Blocking opens.**

- **Version resolution.** What versions do the _non-candidate_ components use? Keith's PRD says
  latest-stable/hybrid; roadmap#199 says pinned tuples. **The two disagree and must be reconciled first.**
  TCK-D1 recommends hybrid for PR-time plus a pinned tuple for release/nightly.
- **There is no written contract to conform to.** Until the Solo Deployment Contract exists (TCK-D4) this is
  an integration gate, not a TCK.
