// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create a Kubernetes pod. solo creates helper or workload pods as part of its
 * operations, so this means the create request did not yield a running pod — for example the API rejected
 * the spec, scheduling failed, or required resources were unavailable.
 */
export class PodCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(result?: unknown) {
    super(
      {
        message: 'Failed to create Kubernetes pod',
        code: ErrorCodeRegistry.POD_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect pod events: kubectl get events -n <namespace>\n' +
          'Check resource quotas: kubectl describe namespace <namespace>\n' +
          'Verify node resource availability: kubectl get nodes',
      },
      undefined,
      result === undefined ? undefined : {result},
    );
  }
}
