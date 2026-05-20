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
        troubleshootingSteps: 'Check cluster connectivity: kubectl get nodes\nCheck logs for details: tail -f ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
