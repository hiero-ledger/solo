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

**Failure (run 29872566219)**: Mirror stuck at block 161 (waiting for 162). CN v0.75.1 correctly
started and BN was stable, but a second race existed at the CN upgrade boundary:

When FREEZE_UPGRADE kills CN v0.74, one CN node (node1) sent `EndStream(RESET, latestAcked=-1)`
at 22:18:05 while block 162 was mid-stream. CN node2 remained alive briefly. BN completed
block 162 (or possibly 163) before CN node2 was killed. Result: BN's live window advanced to
163, but CN v0.75.1 started with `wantedBlock=162`. CN v0.75.1 saw `blocksAvailable: 163-163`,
`wantedBlock < firstAvailableBlock` → permanent blacklist. Mirror could not get block 162.

***

## Attempt 6: BN Upgrade + Long Wait + CN Upgrade + 120s Wait + CN v0.75 Restart

**Sequence**:
1. BN upgrade with cleanup init container — CN v0.74 stays running
2. Poll until mirror receives 3 new blocks via BN v0.38.1, then wait 120 s (BN stable for 2+min)
3. `network upgrade` (PREPARE_UPGRADE + FREEZE_UPGRADE + execute → CN v0.75.1)
4. Wait 120 s (CN v0.75.1 commits ~60 blocks locally while blacklisted)
5. `node restart` — clears the in-memory blacklist
6. Poll until mirror receives 3 new blocks (confirms CN→BN→mirror pipeline healthy)
7. Continue: mirror upgrade, explorer upgrade, etc.

**Why the restart at 120 s works**:
After 120 s, CN v0.75.1's committed state is ~60 blocks past its starting wantedBlock (162).
After restart, CN v0.75.1's wantedBlock ≈ 222. BN's nextExpected ≈ 162. |222−162| = 60 ≤
`staleResendPruneBuffer=100`. BN responds with `RESEND(162)` rather than "not a candidate". CN
replays block 162 from its persistent buffer (`isBufferPersistenceEnabled = true`). BN writes
block 162. Mirror receives it via BN's live subscription and advances.

**Critical constraint**: the restart must happen within 200 s of CN v0.75.1 starting, because
each extra second moves wantedBlock further past BN's nextExpected. Beyond 100 blocks of
divergence, staleResendPruneBuffer is exceeded and BN can no longer RESEND the gap block.

**Failure (run 29876951582)**: Mirror still stuck at block 161, waiting for 162. Even after the
CN v0.75 restart at 23:42:47, mirror reported "No block node can provide block 162" at 23:48:45
(6+ minutes after restart).

**What the logs show**:

BN block log (both files) cuts off at exactly **23:38:22.870** — the moment handler 0 (CN v0.74
node1) was removed with `activePublishers=1` (handler 1 = CN v0.74 node2 still connected). Block
162's verification session had received 35 items but shows **no** `Verified backfill block items
for block=162` or `Wrote verified block 162` entry before truncation. Whether handler 1 completed
block 162 before being killed cannot be determined from the available logs.

Key evidence before cutoff:

* 23:38:21.733 — BN wrote block 161, opened `ExtendedMerkleTreeSession` for block 162
* 23:38:21.780 — Handler 0 sent SKIP for block 162 (handler 1 was the canonical streamer)
* 23:38:22.058 — 35 items accumulated; live-subscriber socket error (unrelated client disconnect)
* 23:38:22.869 — Handler 0 EndStream(RESET, earliestBlock=-1, latestAcked=-1) → removed;
  `activePublishers=1` (handler 1 still active and streaming)
* 23:38:22.870 — Log truncated; no block 162 completion visible

CN v0.75.1 first BN query (23:39:18): `wantedBlock: 162, blocksAvailable: 163-163` → permanent
blacklist. The `blocksAvailable: 163-163` persisted (and grew) for the 120 s sleep, indicating
BN's live window was ahead of CN v0.75.1's wantedBlock throughout.

**Timeline of restart**:

* CN v0.75.1 started: 23:39:14
* `network upgrade` returned, sleep 120 s began: ~23:39:14
* Sleep ended: ~23:41:14
* `node restart` command started: ~23:42:00
* CN v0.75.1 JVM killed and restarted: 23:42:03 → 23:42:47 complete
* Time from CN v0.75.1 start to restart: 169 s → ~84 blocks committed
* Predicted wantedBlock after restart: 162 + 84 = **246**

**What should have happened after restart**:
After restart, CN v0.75.1 reads its committed state (~246) and connects to BN with
wantedBlock=246. BN firstAvailableBlock=163. 246 > 163 → not blacklisted. BN nextExpected=162.
|246−162|=84 ≤ staleResendPruneBuffer=100 → BN sends RESEND(162). CN replays block 162 from
its persistent buffer (`isBufferPersistenceEnabled=true`). BN verifies and writes block 162.
Mirror receives it via live subscription.

**Why it still failed — open questions**:
1. Did the RESEND exchange happen at all? (no post-restart CN or BN logs available)
2. If RESEND happened, did CN's buffer have block 162? (buffer persists across version upgrades
   only if the on-disk format is compatible between CN v0.74 and CN v0.75.1)
3. If CN supplied block 162, did BN accept it? (CN v0.75.1's proof for block 162 may differ
   from what BN's session had partially accumulated from CN v0.74)
4. If BN wrote block 162, can mirror's subscriber access it? (block 162 may be in BN's
   `historic/staging/` but not yet in the finalized historic path that the subscriber reads from)

***

## Attempt 7: Add BN log checkpoints to diagnose remaining unknowns

**Changes**: No sequence changes from Attempt 6. Added `dump_bn_log()` helper function with
5 call sites in `launch_network.sh` to capture BN state at each major step.

**Note**: The `dump_bn_log` commits were not pushed before CI triggered, so this run executed
with Attempt 6's code. Results apply to Attempt 6's sequence, not the intended diagnostic run.

**Failure (run 29884248461)**: Mirror stuck at block **163** (shifted by one from previous runs).

**What the logs show**:

* 02:04:00.109 — Block **162** fully written to `historic/staging` and `live` (first time
  block 162 survived!). N1-STR2 sent ACK for block 162. Handler 0 was already skipping 162.
* 02:04:00.109 — `ExtendedMerkleTreeSession` for block **163** immediately opened.
* 02:04:00.252 — Block 163 session received 21 items (4+3 from N0 before SKIP, then 14 from N1).
* 02:04:01.150 — N0-STR2 EndStream(RESET) → removed; `activePublishers=1` (N1 still connected).
* 02:04:01.152 — BN log completely dark. N1-STR2 sent no more items and never sent a disconnect.
  Whether N1-STR2 disconnected silently or BN's log writer failed is unknown.

Mirror first error at 02:16:48: `No block node can provide block 163` — 1153 identical errors
over ~2 minutes, matching the `wait_for_mirror_block_count_progress` 10-minute timeout.

**Root cause confirmed**: The freeze ALWAYS kills CN mid-block. Block 162 completing was
coincidental (the freeze landed just after 162 finished rather than during it). Block 163 had the
same partial-session problem. BN v0.38.1 retains the in-memory partial session for the
freeze-boundary block even after all publishers disconnect. When CN v0.75 connects with the
correct wantedBlock (163, not blacklisted since 162 was acked), BN's stale session state
prevents it from cleanly accepting CN v0.75's fresh block 163. BN stalls. Mirror stuck.

**Open question resolved**: The CN restart alone does NOT fix the problem because BN's partial
session state persists across the CN restart. BN needs its own restart to clear the in-memory
state.

***

## Attempt 8: Restart BN after freeze to clear partial session, then restart CN v0.75

**Sequence**:
1. BN upgrade with cleanup init container — CN v0.74 stays running
2. Poll until mirror receives 3 new blocks via BN v0.38.1, then wait 120 s
3. `network upgrade` (PREPARE_UPGRADE + FREEZE_UPGRADE + execute → CN v0.75.1)
4. Wait 30 s — CN v0.75 settles; any partial BN session writes complete or are abandoned
5. `kubectl rollout restart statefulset/block-node-1` — clears BN's in-memory partial
   session state (CN v0.75 is already blacklisted so BN downtime adds no NEW blacklist)
6. `kubectl rollout status` — wait for BN pod fully ready (~60 s)
7. Wait 60 s — BN fully initializes from PVC; CN v0.75 builds persistent block buffer
8. `consensus node restart` — clears the permanent BN blacklist
9. CN connects to clean BN; wantedBlock = gap_block (lastAcked+1 from streaming state) OR
   gap_block+~85 (from committed state); either way BN's nextExpected matches or RESEND
   triggers (|gap| ≤ staleResendPruneBuffer=100); gap block delivered; mirror advances

**Timing**: 30 + ~60 (BN restart) + 60 = 150 s before CN restart. At 2 s/block that is
~75 blocks committed → wantedBlock after CN restart = gap_block+75. |75| ≤ 100 ✓

**Why BN restart is safe**: BN's PVC is preserved across pod restart (Kubernetes StatefulSet
semantics). BN reinitializes from PVC: fully verified blocks 0→N-1 remain in `live/` and
`historic/staging/`. The partial in-memory session for block N is gone. BN nextExpected = N
(clean). CN v0.75 provides block N. Mirror receives it.
