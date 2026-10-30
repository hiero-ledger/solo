// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {PvcStrandedPodTracker} from '../../../src/core/pvc-stranded-pod-tracker.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';

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

describe('PvcStrandedPodTracker', (): void => {
  it('does not flag a pod that is unscheduled only while its volumes provision', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2);
    for (let attempt: number = 0; attempt < 10; attempt++) {
      expect(tracker.observe([unscheduledPod('network-node1-0', BINDING_MESSAGE)], attempt)).to.have.lengthOf(0);
    }
  });

  it('flags a pod after a volume affinity conflict persists past the threshold, even when the message alternates', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2);
    expect(tracker.observe([unscheduledPod('network-node2-0', AFFINITY_MESSAGE)], 0)).to.have.lengthOf(0);
    expect(tracker.observe([unscheduledPod('network-node2-0', BINDING_MESSAGE)], 2)).to.have.lengthOf(0);
    const due: Pod[] = tracker.observe([unscheduledPod('network-node2-0', BINDING_MESSAGE)], 3);
    expect(due.map((pod: Pod): string => pod.podReference.name.toString())).to.deep.equal(['network-node2-0']);
  });

  it('stops tracking a pod once it is scheduled', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(3, 2);
    tracker.observe([unscheduledPod('network-node3-0', AFFINITY_MESSAGE)], 0);
    tracker.observe([scheduledPod('network-node3-0')], 1);
    expect(tracker.observe([unscheduledPod('network-node3-0', BINDING_MESSAGE)], 4)).to.have.lengthOf(0);
  });

  it('allows a bounded number of recoveries per pod', (): void => {
    const tracker: PvcStrandedPodTracker = new PvcStrandedPodTracker(1, 2);
    expect(tracker.recordRecovery('network-node4-0')).to.equal(true);
    expect(tracker.recordRecovery('network-node4-0')).to.equal(true);
    expect(tracker.recordRecovery('network-node4-0')).to.equal(false);
    expect(tracker.recordRecovery('network-node5-0')).to.equal(true);
  });
});
