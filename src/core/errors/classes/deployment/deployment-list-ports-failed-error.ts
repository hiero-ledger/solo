// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
