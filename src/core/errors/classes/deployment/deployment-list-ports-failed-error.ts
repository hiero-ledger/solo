// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot enumerate the forwarded ports for a deployment; the
 * underlying failure is wrapped in `cause`. Listing ports queries the Kubernetes API in the
 * deployment's namespace to discover the active port-forwards exposing its components, so this
 * is raised when that query fails — typically because the cluster's API server is unreachable
 * or the namespace cannot be inspected. It is retryable, as a transient connectivity problem
 * often clears on a later attempt.
 */
export class DeploymentListPortsFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error listing deployment ports',
        code: ErrorCodeRegistry.DEPLOYMENT_LIST_PORTS_FAILED,
        troubleshootingSteps:
          'Check logs for details: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the Kubernetes API server is reachable: kubectl cluster-info\n' +
          'List port-forwards in the namespace to check for any issues: kubectl get port-forwards -n <namespace>',
      },
      cause,
    );
  }
}
