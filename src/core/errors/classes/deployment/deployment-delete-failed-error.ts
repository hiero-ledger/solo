// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when removing a deployment fails; the underlying failure is wrapped in
 * `cause`. Deleting a deployment removes its entry from the local configuration and may reach
 * into each attached cluster to clean up, so this is raised when that work cannot complete —
 * most often because one of the deployment's cluster references or its kubeconfig context is
 * invalid or unreachable. It is retryable, since a transient connectivity problem often clears
 * on a later attempt once the contexts are reachable again.
 */
export class DeploymentDeleteFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error deleting deployment',
        code: ErrorCodeRegistry.DEPLOYMENT_DELETE_FAILED,
        troubleshootingSteps:
          'Check logs for details: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify cluster references and their contexts are valid: solo cluster-ref config list',
      },
      cause,
    );
  }
}
