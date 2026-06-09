// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ContainerOperationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(operation: string, cause: Error) {
    super(
      {
        message: `Container operation '${operation}' failed: ${cause.message}`,
        code: ErrorCodeRegistry.CONTAINER_OPERATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the pod is running: kubectl get pods -n <namespace>\n' +
          'Inspect pod logs: kubectl logs <pod> -n <namespace>\n' +
          'Check pod status: kubectl describe pod <pod> -n <namespace>',
      },
      cause,
    );
  }
}
