// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when consensus node pods stay unschedulable because their volumes were provisioned on nodes the
 * pods can no longer run on, even after the stranded claims were deleted and re-provisioned. This happens with
 * node-local volumes: once any claim of a pod is bound to a node, the pod can only be scheduled there.
 */
export class PvcPodsStrandedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(podNames: string[], recoveryAttempts: number, schedulerMessage: string) {
    super({
      message:
        `Pods are unschedulable because their volumes are pinned to unusable nodes: ${podNames.join(', ')} ` +
        `(still stranded after ${recoveryAttempts} claim re-provisioning attempt(s)). Scheduler: ${schedulerMessage}`,
      code: ErrorCodeRegistry.PVC_PODS_STRANDED,
      troubleshootingSteps:
        'Check why the pod cannot be scheduled: kubectl describe pod <name> -n <namespace>\n' +
        'Check which node each volume is pinned to: kubectl get pv -o custom-columns=NAME:.metadata.name,CLAIM:.spec.claimRef.name,NODE:.spec.nodeAffinity\n' +
        'Confirm the nodes allowed for the pod have free cpu and memory: kubectl describe node <name>\n' +
        'Use a StorageClass that is not node-local with --pvc-storage-class, or disable persistent volumes with --pvcs=false',
    });
  }
}
