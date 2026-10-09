# Solo TCK — Overview

**Status:** Draft (PRD v0.2) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) ·
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md) ·
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md)

A compatibility kit, owned by the Solo team, answering one question about a candidate component build:

> **Does this build deploy cleanly via a supported Solo release and produce a functional network?**

**Consumers.** CN, Mirror Node, Block Node, JSON-RPC Relay, the JS SDK, and Solo itself. The Explorer _UI_
is out of scope; its **server API is in scope**, and Explorer runs no Solo today, so that is entirely new
CI.

**Where it runs.** In each component's own CI against its branch build — at PR time where that team already
runs Solo per PR (Mirror Node, Relay), otherwise on their existing schedule (CN 3-hourly, Block Node
daily/weekly).

**Home.** The Solo repo, released as a versioned action on its own release tags (TCK-D2), keeping direct
reuse of the `test/e2e` harness.

**Blocking opens.**

- **Version resolution.** Keith's PRD says latest-stable/hybrid; roadmap#199 says pinned tuples. The two
  disagree and must be reconciled first. TCK-D1 recommends hybrid for PR-time plus a pinned tuple for
  release/nightly.
- **No written contract to conform to.** Until the Solo Deployment Contract exists (TCK-D4) this is an
  integration gate, not a TCK.
