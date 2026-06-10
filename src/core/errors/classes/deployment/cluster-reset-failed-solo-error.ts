// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterResetFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Cluster reset failed: ${cause.message}`,
        code: ErrorCodeRegistry.CLUSTER_RESET_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect cluster state: kubectl get pods -A\n' +
          'Check Helm releases still present: helm list -A\n' +
          'Re-run cluster reset: solo cluster-ref config reset',
      },
      cause,
    );
  }
}
