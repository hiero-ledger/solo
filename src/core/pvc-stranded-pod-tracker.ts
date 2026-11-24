// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {type PodCondition} from '../integration/kube/resources/pod/pod-condition.js';
import {type PvcDetail} from '../integration/kube/resources/pvc/pvc-detail.js';

/**
 * Detects pods whose volumes were provisioned on nodes the pods cannot run on. With a node-local StorageClass a pod's
 * claims bind to whichever node the scheduler first picked; if that node is then taken, the pod can never schedule
 * elsewhere and its remaining claims never bind. Such a pod stays unscheduled while its scheduler messages mention
 * the volume node affinity, so that is what is tracked.
 */
export class PvcStrandedPodTracker {
  private static readonly POD_SCHEDULED: string = 'PodScheduled';
  private static readonly VOLUME_AFFINITY_MESSAGE: string = "didn't match PersistentVolume's node affinity";

  /**
   * Matches a scheduler message that blames, at least in part, the pod's volumes: unbound or unavailable claims, volume
   * node affinity, or storage capacity. Such a pod may still schedule once its volumes provision.
   */
  private static readonly VOLUME_SCHEDULING_MESSAGE: RegExp = /volume|pvc|free storage/i;

  /** attempt at which each currently unscheduled pod was first seen unscheduled */
  private readonly unscheduledSince: Map<string, number> = new Map();

  /** pods whose scheduler message has reported a volume node affinity conflict */
  private readonly affinityConflicts: Set<string> = new Set();

  /** the latest scheduler message of each currently unscheduled pod */
  private readonly schedulerMessages: Map<string, string> = new Map();

  private readonly recoveries: Map<string, number> = new Map();

  private lastAttempt: number = 0;

  private lastMessage: string = '<none>';

  /**
   * @param thresholdAttempts - how many attempts a pod must stay unscheduled, with a volume conflict reported, to be
   * considered stranded. The scheduler message alternates between causes, so conflict is remembered, not required on
   * every poll.
   * @param maxRecoveries - how many times the same pod may be recovered before it is reported as unrecoverable
   * @param deployStartedAt - when the current deploy began. Claims created before it predate this deploy (the chart
   * keeps them across uninstalls) and may hold data, so they are never deleted.
   */
  public constructor(
    private readonly thresholdAttempts: number,
    private readonly maxRecoveries: number,
    private readonly deployStartedAt: Date,
  ) {}

  /**
   * The claims that belong to a pod. A StatefulSet names each claim `<template>-<pod>`.
   * @param podName - the pod name
   * @param claims - the claims to choose from
   */
  public claimsOf(podName: string, claims: PvcDetail[]): PvcDetail[] {
    return claims.filter((claim: PvcDetail): boolean => claim.pvcReference.name.toString().endsWith(`-${podName}`));
  }

  /**
   * The claims that must not be re-provisioned because they may hold data: those created before this deploy began,
   * and those whose creation time is not known.
   * @param claims - the claims to check
   */
  public retainedClaims(claims: PvcDetail[]): PvcDetail[] {
    return claims.filter(
      (claim: PvcDetail): boolean =>
        claim.createdAt === undefined || claim.createdAt.getTime() < this.deployStartedAt.getTime(),
    );
  }

  /**
   * Records the current state of the pods and returns those that are stranded and due for recovery.
   * @param pods - the pods to inspect
   * @param attempt - the current poll attempt
   */
  public observe(pods: Pod[], attempt: number): Pod[] {
    const due: Pod[] = [];
    const unscheduledNow: Set<string> = new Set();
    this.lastAttempt = attempt;

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
      if (!this.unscheduledSince.has(name)) {
        this.unscheduledSince.set(name, attempt);
      }
      if (condition?.message) {
        this.schedulerMessages.set(name, condition.message);
      }
      if (condition?.message?.includes(PvcStrandedPodTracker.VOLUME_AFFINITY_MESSAGE)) {
        this.affinityConflicts.add(name);
      }
      // only a pod with a volume conflict is of interest: other scheduling failures (CPU, taints, ...) are not a
      // volume problem and are left to the pod readiness checks that follow
      if (this.affinityConflicts.has(name) && condition?.message) {
        this.lastMessage = condition.message;
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

  /**
   * Names of the pods that were not yet scheduled at the last observation and have reported a volume node affinity
   * conflict. Pods that are unscheduled for any other reason are not included.
   */
  public get affinityConflictPodNames(): string[] {
    return [...this.unscheduledSince.keys()].filter((name: string): boolean => this.affinityConflicts.has(name));
  }

  /**
   * Pods that have stayed unscheduled for at least the given number of attempts for a reason other than their volumes
   * (cpu, memory, taints, node selectors, ...), mapped to the scheduler's latest explanation. With a
   * `WaitForFirstConsumer` StorageClass the claims of such a pod do not bind until it is scheduled, so waiting on them
   * cannot succeed. A pod that has reported a volume node affinity conflict is not included: that is a volume problem.
   * @param minimumAttempts - how many attempts a pod must have been unscheduled for
   */
  public podsUnschedulableForOtherReasons(minimumAttempts: number): Map<string, string> {
    const blocked: Map<string, string> = new Map();
    for (const [name, since] of this.unscheduledSince) {
      const message: string | undefined = this.schedulerMessages.get(name);
      if (
        this.lastAttempt - since >= minimumAttempts &&
        !this.affinityConflicts.has(name) &&
        message !== undefined &&
        !PvcStrandedPodTracker.VOLUME_SCHEDULING_MESSAGE.test(message)
      ) {
        blocked.set(name, message);
      }
    }
    return blocked;
  }

  /** The most recent scheduler message seen for a pod with a volume node affinity conflict. */
  public get lastSchedulerMessage(): string {
    return this.lastMessage;
  }

  public get maxRecoveryAttempts(): number {
    return this.maxRecoveries;
  }

  private forget(podName: string): void {
    this.unscheduledSince.delete(podName);
    this.affinityConflicts.delete(podName);
    this.schedulerMessages.delete(podName);
  }
}
