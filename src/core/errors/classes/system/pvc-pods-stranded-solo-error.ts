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

  /**
   * @param podNames - the pods that cannot be scheduled
   * @param recoveryAttempts - how many times the claims of one pod may be re-provisioned
   * @param schedulerMessage - the scheduler's last explanation
   * @param retainedClaims - claims that predate this deploy and were left in place because they may hold data
   */
  public constructor(
    podNames: string[],
    recoveryAttempts: number,
    schedulerMessage: string,
    retainedClaims: string[] = [],
  ) {
    super({
      message:
        retainedClaims.length > 0
          ? 'Pods cannot be scheduled because their volume claims are bound to nodes they cannot run on: ' +
            `${podNames.join(', ')}. The claims predate this deploy and may hold data, so they were left in place: ` +
            `${retainedClaims.join(', ')}. Scheduler: ${schedulerMessage}`
          : `Pods are still unschedulable after their volume claims were provisioned: ${podNames.join(', ')} ` +
            `(up to ${recoveryAttempts} claim re-provisioning attempt(s) per pod). Scheduler: ${schedulerMessage}`,
      code: ErrorCodeRegistry.PVC_PODS_STRANDED,
      troubleshootingSteps:
        (retainedClaims.length > 0
          ? 'If the data on the retained claims is not needed, delete them and the pod, then deploy again: ' +
            'kubectl delete pvc <name> -n <namespace>\n'
          : '') +
        'Check why the pod cannot be scheduled: kubectl describe pod <name> -n <namespace>\n' +
        'Check which node each volume is pinned to: kubectl get pv -o custom-columns=NAME:.metadata.name,CLAIM:.spec.claimRef.name,NODE:.spec.nodeAffinity\n' +
        'Confirm the nodes allowed for the pod have free cpu and memory: kubectl describe node <name>\n' +
        'Use a StorageClass that is not node-local with --pvc-storage-class, or disable persistent volumes with --pvcs=false',
    });
  }
}
