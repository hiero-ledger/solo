// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an operation against a container fails; the message names the operation and wraps the
 * underlying failure in `cause`. solo runs operations such as exec and file copy inside pod containers, so
 * this means that operation failed — for example the container was not reachable, the command errored, or
 * the connection dropped.
 */
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
