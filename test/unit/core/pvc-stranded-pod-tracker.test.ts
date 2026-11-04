// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {PvcStrandedPodTracker} from '../../../src/core/pvc-stranded-pod-tracker.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type PvcDetail} from '../../../src/integration/kube/resources/pvc/pvc-detail.js';
import {PvcReference} from '../../../src/integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../../../src/integration/kube/resources/pvc/pvc-name.js';
import {Duration} from '../../../src/core/time/duration.js';

const CLAIM_AGE: Duration = Duration.ofMinutes(30);
const AFFINITY_MESSAGE: string =
  "0/56 nodes are available: 3 node(s) didn't match PersistentVolume's node affinity, 5 Insufficient cpu.";
const BINDING_MESSAGE: string = "0/56 nodes are available: 4 node(s) didn't find available persistent volumes to bind.";

function unscheduledPod(name: string, message: string): Pod {
  return {
    podReference: PodReference.of(NamespaceName.of('solo'), PodName.of(name)),
    conditions: [{type: 'PodScheduled', status: 'False', message}],
  } as unknown as Pod;
}

function scheduledPod(name: string): Pod {
  return {
    podReference: PodReference.of(NamespaceName.of('solo'), PodName.of(name)),
    conditions: [{type: 'PodScheduled', status: 'True'}],
  } as unknown as Pod;
}

function claim(name: string, createdAt?: Date): PvcDetail {
  return {
    pvcReference: PvcReference.of(NamespaceName.of('solo'), PvcName.of(name)),
    phase: 'Bound',
    requestedStorageBytes: 1024,
    storageClassName: 'local-path',
    createdAt,
  };
}

describe('PvcStrandedPodTracker', (): void => {
  it('does not flag a pod that is unscheduled only while its volumes provision', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    for (let attempt: number = 0; attempt < 10; attempt++) {
      expect(tracker.observe([unscheduledPod('network-node1-0', BINDING_MESSAGE)], attempt)).to.have.lengthOf(0);
    }
  });

  it('flags a pod after a volume affinity conflict persists past the threshold, even when the message alternates', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    expect(tracker.observe([unscheduledPod('network-node2-0', AFFINITY_MESSAGE)], 0)).to.have.lengthOf(0);
    expect(tracker.observe([unscheduledPod('network-node2-0', BINDING_MESSAGE)], 2)).to.have.lengthOf(0);
    const due: Pod[] = tracker.observe([unscheduledPod('network-node2-0', BINDING_MESSAGE)], 3);
    expect(due.map((pod: Pod): string => pod.podReference.name.toString())).to.deep.equal(['network-node2-0']);
  });

  it('stops tracking a pod once it is scheduled', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    tracker.observe([unscheduledPod('network-node3-0', AFFINITY_MESSAGE)], 0);
    tracker.observe([scheduledPod('network-node3-0')], 1);
    expect(tracker.observe([unscheduledPod('network-node3-0', BINDING_MESSAGE)], 4)).to.have.lengthOf(0);
  });

  it('reports only pods with a volume affinity conflict, with the scheduler message of that conflict', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    const unplaced: Pod = {
      podReference: PodReference.of(NamespaceName.of('solo'), PodName.of('network-node6-0')),
    } as unknown as Pod;
    tracker.observe(
      [
        unplaced,
        unscheduledPod('network-node7-0', BINDING_MESSAGE),
        unscheduledPod('network-node2-0', AFFINITY_MESSAGE),
        scheduledPod('network-node1-0'),
      ],
      0,
    );
    expect(tracker.affinityConflictPodNames).to.deep.equal(['network-node2-0']);
    expect(tracker.lastSchedulerMessage).to.equal(AFFINITY_MESSAGE);
  });

  it('does not report a pod that is unscheduled for a reason other than its volumes', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    const insufficientCpu: string = '0/56 nodes are available: 56 Insufficient cpu.';
    for (let attempt: number = 0; attempt < 10; attempt++) {
      expect(tracker.observe([unscheduledPod('network-node5-0', insufficientCpu)], attempt)).to.have.lengthOf(0);
    }
    expect(tracker.affinityConflictPodNames).to.have.lengthOf(0);
    expect(tracker.lastSchedulerMessage).to.equal('<none>');
  });

  it('keeps reporting a conflicted pod while its message alternates, until it is scheduled', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    tracker.observe([unscheduledPod('network-node2-0', AFFINITY_MESSAGE)], 0);
    tracker.observe([unscheduledPod('network-node2-0', BINDING_MESSAGE)], 1);
    expect(tracker.affinityConflictPodNames).to.deep.equal(['network-node2-0']);
    tracker.observe([scheduledPod('network-node2-0')], 2);
    expect(tracker.affinityConflictPodNames).to.have.lengthOf(0);
  });

  it('selects only the claims that belong to the pod', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    const claims: PvcDetail[] = [
      claim('hgcapp-data-saved-pvc-network-node1-0'),
      claim('hgcapp-output-pvc-network-node1-0'),
      claim('hgcapp-data-saved-pvc-network-node11-0'),
      claim('hgcapp-data-saved-pvc-network-node2-0'),
    ];
    expect(
      tracker.claimsOf('network-node1-0', claims).map((found: PvcDetail): string => found.pvcReference.name.toString()),
    ).to.deep.equal(['hgcapp-data-saved-pvc-network-node1-0', 'hgcapp-output-pvc-network-node1-0']);
  });

  it('retains claims that are older than the maximum age or whose age is unknown', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2, CLAIM_AGE);
    const now: number = Date.parse('2026-11-04T12:00:00Z');
    const fresh: PvcDetail = claim('fresh-network-node1-0', new Date(now - Duration.ofMinutes(5).toMillis()));
    const old: PvcDetail = claim('old-network-node1-0', new Date(now - Duration.ofHours(2).toMillis()));
    const unknown: PvcDetail = claim('unknown-network-node1-0');
    expect(
      tracker
        .retainedClaims([fresh, old, unknown], now)
        .map((retained: PvcDetail): string => retained.pvcReference.name.toString()),
    ).to.deep.equal(['old-network-node1-0', 'unknown-network-node1-0']);
  });

  it('allows a bounded number of recoveries per pod', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(1, 2, CLAIM_AGE);
    expect(tracker.recordRecovery('network-node4-0')).to.equal(true);
    expect(tracker.recordRecovery('network-node4-0')).to.equal(true);
    expect(tracker.recordRecovery('network-node4-0')).to.equal(false);
    expect(tracker.recordRecovery('network-node5-0')).to.equal(true);
  });
});
