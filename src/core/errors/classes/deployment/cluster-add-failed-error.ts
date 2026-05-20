// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterAddFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error adding cluster to deployment',
        code: ErrorCodeRegistry.CLUSTER_ADD_FAILED,
        troubleshootingSteps:
          'Verify cluster connectivity: kubectl get nodes\nCheck logs for details: tail -f ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
