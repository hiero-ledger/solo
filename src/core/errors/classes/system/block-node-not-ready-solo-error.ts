// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BlockNodeNotReadySoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(releaseName: string, cause: Error) {
    super(
      {
        message: `Block node ${releaseName} is not ready: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_NOT_READY,
        troubleshootingSteps:
          `Check block node pod status: kubectl get pods -A | grep ${releaseName}\n` +
          `Describe pods for readiness probe failures: kubectl describe pods -A -l app.kubernetes.io/instance=${releaseName}\n` +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
