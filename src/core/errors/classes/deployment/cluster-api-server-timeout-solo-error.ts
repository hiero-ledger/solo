// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterApiServerTimeoutSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(context: string, maxAttempts: number, cause: Error) {
    super(
      {
        message: `Cluster '${context}' API server did not become ready after ${maxAttempts} attempts: ${cause.message}`,
        code: ErrorCodeRegistry.CLUSTER_API_SERVER_TIMEOUT,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the cluster context is reachable: kubectl cluster-info --context ${context}\n` +
          'Check cluster node status: kubectl get nodes\n' +
          'Inspect cluster pods: kubectl get pods -A',
      },
      cause,
    );
  }
}
