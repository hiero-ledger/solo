# Solo TCK — Overview

**Status:** Draft · **Roadmap:** [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
· **Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
· **Detailed design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

A one-page brief. For the full design — contract, budgets, roadmap — see the detailed doc above.

## What it is

The Solo TCK lets any Hiero component team — consensus node, mirror node, explorer, relay, block node
— point Solo at a **candidate version of their component** and get a clear answer to one question:

> **Does this version break Solo?**

Solo is the shared **compatibility harness**. The component team is the one running the check.

## Why we need it

Solo stitches five independently-released components into a working network. When any of them ships a
new version, it can quietly break Solo — a changed config key, a new startup order, a schema change.
Today nothing catches that until a user hits it.

This becomes urgent with [#4269](https://github.com/hiero-ledger/solo/issues/4269) (`--edge`), which
will have Solo auto-pull the latest version of every component. That is only safe if something proves
those versions actually work. **The TCK is that proof — which is why #4269 depends on it.**

## The model (and what it is *not*)

It is **not** the Hiero SDK TCK model. That one checks that six language SDKs behave identically —
interchangeability. Solo is a single tool; there is nothing to cross-check that way.

It **is** the [Kubernetes conformance](https://github.com/cncf/k8s-conformance) model: many
independent producers (component teams) certify their artifact against one shared harness (Solo).
"Does version X of your component conform to what Solo expects?"

## How a run works

1. **Start from a known-good tuple** — a pinned set of component versions (CN, mirror, block node,
   relay, explorer, JDK) defined in an external **profile** (e.g. mainnet, testnet). To test a
   candidate, override **one** entry; everything else stays at the profile baseline.
2. **Deploy a real network through Solo.**
3. **Verify against reality** — the mirror node and the live cluster confirm the network actually
   works. The TCK never trusts Solo's own "success" message.

Changing only one component at a time is deliberate: if the run fails, the candidate is the only thing
different from a known-good tuple, so the result points straight at that version.

## Three ways the same suites get used

| Trigger                          | Question it answers                       | Who benefits         |
| -------------------------------- | ----------------------------------------- | -------------------- |
| **PR gate**                      | "Does this change break Solo?"            | Solo devs            |
| **Nightly tuple validation**     | "Is the pinned tuple still compatible?"   | Solo release process |
| **Per-release published result** | a compatibility signal, no Solo CI to run | component teams      |

Same tests, different triggers. A component team can either run the check against their candidate
(overriding one tuple entry) or read the published per-release result.

## Where it stands

Solo already runs real end-to-end deploys in CI and already centralizes component versions, so this is
mostly **turning existing tests into a guaranteed, enforced, version-parameterized gate** — plus new
pieces: external tuple **profile files** (mainnet/testnet), a small performance check, a **published
per-release results artifact**, and an entry point external teams can call.

**Biggest dependency (from roadmap #199):** the CN, mirror, and block-node teams need to agree on the
**tuple profile contract** — which versions it pins (including JDK) and its schema.

See the [detailed design](./solo-tck-conformance-gate.md) for the run contract, time budgets, coverage
gaps, and the implementation roadmap.
