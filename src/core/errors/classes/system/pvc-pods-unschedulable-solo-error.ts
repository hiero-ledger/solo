// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown while waiting for consensus node volume claims to bind when a pod that owns unbound claims cannot
 * be scheduled for a reason other than its volumes (cpu, memory, taints, node selectors, ...). With a
 * `WaitForFirstConsumer` StorageClass a claim binds only once its pod is scheduled, so the claims would never bind.
 */
export class PvcPodsUnschedulableSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  /**
   * @param pods - each unschedulable pod with the scheduler's explanation, e.g. `network-node1-0 (0/1 nodes ...)`
   * @param unboundCount - how many volume claims are still unbound
   */
  public constructor(pods: string[], unboundCount: number) {
    super({
      message:
        `Pods cannot be scheduled, so their volume claims cannot bind (${unboundCount} claim(s) unbound): ` +
        pods.join('; '),
      code: ErrorCodeRegistry.PVC_PODS_UNSCHEDULABLE,
      troubleshootingSteps:
        'Check why the pod cannot be scheduled: kubectl describe pod <name> -n <namespace>\n' +
        'Confirm the nodes have free cpu and memory for the consensus node: kubectl describe node <name>\n' +
        'Check node taints and the pod node selector or affinity match the available nodes\n' +
        'Free capacity or add nodes, then deploy again',
    });
  }
}
