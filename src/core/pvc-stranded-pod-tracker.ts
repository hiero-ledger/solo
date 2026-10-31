// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {type PodCondition} from '../integration/kube/resources/pod/pod-condition.js';

/**
 * Detects pods whose volumes were provisioned on nodes the pods cannot run on. With a node-local StorageClass a pod's
 * claims bind to whichever node the scheduler first picked; if that node is then taken, the pod can never schedule
 * elsewhere and its remaining claims never bind. Such a pod stays unscheduled while its scheduler messages mention
 * the volume node affinity, so that is what is tracked.
 */
export class PvcStrandedPodTracker {
  private static readonly POD_SCHEDULED: string = 'PodScheduled';
  private static readonly VOLUME_AFFINITY_MESSAGE: string = "didn't match PersistentVolume's node affinity";

  /** attempt at which each currently unscheduled pod was first seen unscheduled */
  private readonly unscheduledSince: Map<string, number> = new Map();

  /** pods whose scheduler message has reported a volume node affinity conflict */
  private readonly affinityConflicts: Set<string> = new Set();

  private readonly recoveries: Map<string, number> = new Map();

  private lastMessage: string = '<none>';

  /**
   * @param thresholdAttempts - how many attempts a pod must stay unscheduled, with a volume conflict reported, to be
   * considered stranded. The scheduler message alternates between causes, so conflict is remembered, not required on
   * every poll.
   * @param maxRecoveries - how many times the same pod may be recovered before it is reported as unrecoverable
   */
  public constructor(
    private readonly thresholdAttempts: number,
    private readonly maxRecoveries: number,
  ) {}

  /**
   * Records the current state of the pods and returns those that are stranded and due for recovery.
   * @param pods - the pods to inspect
   * @param attempt - the current poll attempt
   */
  public observe(pods: Pod[], attempt: number): Pod[] {
    const due: Pod[] = [];
    const unscheduledNow: Set<string> = new Set();

    for (const pod of pods) {
      const name: string = pod.podReference.name.toString();
      const scheduling: PodCondition[] =
        pod.conditions?.filter(
          (candidate: PodCondition): boolean => candidate.type === PvcStrandedPodTracker.POD_SCHEDULED,
        ) ?? [];
      if (scheduling.some((candidate: PodCondition): boolean => candidate.status === 'True')) {
        continue;
      }
      // a pod without a PodScheduled condition has not been placed yet either
      const condition: PodCondition | undefined = scheduling[0];

      unscheduledNow.add(name);
      if (condition?.message) {
        this.lastMessage = condition.message;
      }
      if (!this.unscheduledSince.has(name)) {
        this.unscheduledSince.set(name, attempt);
      }
      if (condition?.message?.includes(PvcStrandedPodTracker.VOLUME_AFFINITY_MESSAGE)) {
        this.affinityConflicts.add(name);
      }
      if (this.affinityConflicts.has(name) && attempt - this.unscheduledSince.get(name) >= this.thresholdAttempts) {
        due.push(pod);
      }
    }

    for (const name of this.unscheduledSince.keys()) {
      if (!unscheduledNow.has(name)) {
        this.forget(name);
      }
    }

    return due;
  }

  /**
   * Notes that a pod is being recovered and restarts its tracking.
   * @returns false once the pod has already been recovered the maximum number of times
   */
  public recordRecovery(podName: string): boolean {
    const count: number = (this.recoveries.get(podName) ?? 0) + 1;
    if (count > this.maxRecoveries) {
      return false;
    }
    this.recoveries.set(podName, count);
    this.forget(podName);
    return true;
  }

  /** Names of the pods that were not yet scheduled at the last observation. */
  public get unscheduledPodNames(): string[] {
    return [...this.unscheduledSince.keys()];
  }

  /** The most recent scheduler message seen for an unscheduled pod. */
  public get lastSchedulerMessage(): string {
    return this.lastMessage;
  }

  public get maxRecoveryAttempts(): number {
    return this.maxRecoveries;
  }

  private forget(podName: string): void {
    this.unscheduledSince.delete(podName);
    this.affinityConflicts.delete(podName);
  }
}
