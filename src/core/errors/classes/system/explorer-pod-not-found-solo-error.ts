// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot find a Hiero Explorer pod. solo locates the explorer pod to operate on it or
 * check its status, so this is raised when no matching pod exists in the namespace — for example the
 * explorer failed to start, was removed, or was never deployed.
 */
export class ExplorerPodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No Hiero Explorer pod found',
      code: ErrorCodeRegistry.EXPLORER_POD_NOT_FOUND,
      troubleshootingSteps:
        'Check pod status: kubectl get pods -A | grep explorer\n' +
        'Describe pods to check for crashes or evictions: kubectl describe pods -A -l app.kubernetes.io/component=hiero-explorer\n' +
        'Check recent namespace events: kubectl get events -n <namespace> --sort-by=.lastTimestamp',
    });
  }
}
