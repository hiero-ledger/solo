# Migration Upgrade Experiments: CN v0.74→v0.75 + BN v0.37→v0.38.1

## Root Problems

Two independent bugs interact to create a deadlock:

1. **CN v0.75 permanent blacklist** (hiero-consensus-node#26456): CN v0.75 permanently marks BN
   ineligible — with no retry — when either:
   * BN reports `firstAvailableBlock` > the block CN wants to send (wrong block range)
   * BN has any connection error (pod restart, brief unavailability)

2. **BN v0.37 stale `block-ranges.json`** (hiero-block-node#3249): BN writes
   `block-ranges.json` when it *opens* a block session — before the `.blk` file lands on disk.
   If BN is killed mid-session, the file claims block N exists when only 0→N-1 are on disk.
   BN v0.38.1 then reports a wrong `firstAvailableBlock` → CN v0.75 blacklists it immediately
   on first contact.

***

## Attempt 1: CN Upgrade First

**Sequence**: CN v0.74 → v0.75, *then* BN v0.37 → v0.38.1

**Failure**: During the BN upgrade (~55s downtime), CN v0.75 was already running and saw BN
connection errors. CN v0.75 permanently blacklisted BN. Even after BN v0.38.1 came back up,
CN v0.75 never sent blocks to it. Mirror stuck.

***

## Attempt 2: BN Upgrade First (with cleanup init container)

**Sequence**: BN v0.37 → v0.38.1 while CN v0.74 still running, wait for 2 mirror blocks
confirming BN v0.38.1 is healthy, *then* CN v0.74 → v0.75.

**Reasoning**: When CN v0.75 starts, BN v0.38.1 is already running — no connection error,
no blacklist.

**Fix added**: Cleanup init container removes stale `block-ranges.json` before BN v0.38.1
starts, so `firstAvailableBlock` is rebuilt from actual disk state.

**Failure (run 29850199044)**: Mirror still stuck. CN v0.75 still blacklisted BN. Root cause
unclear without BN logs — likely either:

* The brief BN downtime (~55s during upgrade) overlapped with CN v0.75 first startup window
* BN v0.38.1 was still initializing when CN v0.75 first tried to connect (a few seconds too early)

**Discovery**: `blockNode.wantedBlockExpirationMillis=300000` does NOT help — it only controls
block-delivery timeout, not connection-error blacklisting. CN v0.75 blacklists regardless of
this setting.

***

## The Core Dilemma

| Order | Problem |
|-------|---------|
| CN first, then BN | CN v0.75 runs while BN goes down → connection errors → permanent blacklist |
| BN first, then CN | BN upgrade takes ~55s; CN v0.75 might start during BN's final startup window → brief unavailability → blacklist |

**The fundamental tension**: CN v0.75 starts actively connecting to BN immediately on boot.
Any moment where BN is unavailable or mis-reporting its state — even for a few seconds — triggers
an unrecoverable permanent blacklist. There is no safe ordering when both components are
transitioning simultaneously.

***

## Current Approach: Freeze First, Then Separate Each Transition

**Sequence**:

1. `network freeze` (FREEZE\_ONLY) — stops CN JVM cleanly, block stream drained internally
   by the freeze handler; no new blocks while BN is being replaced.
2. BN upgrade with cleanup init container — safe, no race condition (CN JVM is stopped, pod
   stays running for later `fetchPlatformSoftware`).
3. Wait 60s — BN v0.38.1 runs fully stable with zero traffic.
4. `node restart` — restart CN v0.74 JVM (no phase validation needed; works from FROZEN phase);
   CN connects to already-stable BN v0.38.1.
5. `consensus network upgrade` — atomic PREPARE\_UPGRADE + FREEZE\_UPGRADE + execute; CN v0.75
   starts when BN has been running for 60+ seconds.

**Failure (run 29859016655)**: Mirror stuck at block 83, never advancing to 84. CN v0.75.1
ran (account create succeeded) but blocks stopped reaching BN. CN v0.75.1 blacklisted BN
during its very first connection attempt when CN v0.75.1 JVM started at the end of the
`network upgrade` step. Even though BN had been running stably for 60+ seconds, there was
a brief connection hiccup (likely BN closing the old CN v0.74 stream) at the exact moment
CN v0.75.1 first tried to connect → permanent blacklist.

---

## Attempt 4: Freeze + BN Upgrade + Restart v0.74 + Network Upgrade + Restart v0.75

**Sequence**:
1. `network freeze` (stops CN JVM, drains block stream)
2. BN upgrade with cleanup init container
3. Wait 60s for BN to stabilize
4. `node restart` (restart CN v0.74 JVM — needed so PREPARE_UPGRADE/FREEZE_UPGRADE can be submitted)
5. `network upgrade` (atomic: PREPARE_UPGRADE + FREEZE_UPGRADE + execute → CN v0.75.1)
6. `node restart` (restart CN v0.75.1 JVM — clears any in-memory BN blacklist from startup)

**Failure (run 29868390295)**: Mirror stuck at block 72, never advancing to 73. Root cause:

When CN v0.74 restarts from FROZEN state (step 4), the first 2 consensus-recovery blocks (73 and
74) have incomplete Merkle state proofs — **1 path instead of the expected 3** — because the
consensus round reconvergence is incomplete at that moment. BN v0.38.1 rejects them with
`BAD_BLOCK_PROOF`. Those blocks **never land on disk**. Block 75 onward pass verification fine.

After CN v0.75.1 starts, its `wantedBlock` is 73 (the first block BN doesn't have). Mirror asks
BN for block 73: BN returns `NOT_AVAILABLE`. Mirror is stuck forever.

Step 6 (CN v0.75.1 restart) is also counterproductive: it resets CN v0.75.1's `wantedBlock` to
the stale on-disk value while BN has already advanced further, widening the gap.

**Root cause**: FREEZE_ONLY + CN v0.74 restart fundamentally cannot work — the recovery blocks
always have bad proofs, and BN correctly rejects them.

***

## Attempt 5: BN Upgrade While CN Runs + Long Stability Wait + Network Upgrade

**Sequence**:
1. BN upgrade with cleanup init container — CN v0.74 **stays running** throughout
2. Poll until mirror receives 3 new blocks via BN v0.38.1 (proves CN→BN→mirror pipeline healthy),
   then wait 120 s more (BN stable for 2+ minutes before CN v0.75 starts)
3. `network upgrade` (PREPARE_UPGRADE + FREEZE_UPGRADE + execute → CN v0.75.1)

**Why this avoids previous failure modes**:
- No FREEZE_ONLY → no CN v0.74 restart from FROZEN → no BAD_BLOCK_PROOF recovery blocks
- CN v0.74 does NOT permanently blacklist BN (only v0.75 does), so CN v0.74 reconnects
  automatically after BN v0.38.1 comes up
- 3 confirmed mirror blocks + 120 s additional wait ensures BN is demonstrably stable before
  CN v0.75 makes its first connection attempt
- FREEZE_UPGRADE manages the block boundary cleanly, so CN v0.75.1 `wantedBlock` = BN `nextExpected`

**Key difference from Attempt 2**: Attempt 2 waited for only 2 mirror blocks — not enough. This
attempt waits for 3 blocks AND 120 s extra, giving BN 2+ minutes of proven stability.
