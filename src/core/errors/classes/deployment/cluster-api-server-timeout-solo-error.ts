// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a cluster's Kubernetes API server does not become ready within the
 * allowed number of attempts; the message names the `context` and the `maxAttempts` tried, and
 * wraps the last failure in `cause`. solo polls the API server before proceeding so it does not
 * act against a cluster that is still starting, and raises this once polling is exhausted. It is
 * retryable because a cluster that is merely slow to come up (for example a Kind cluster still
 * initialising) often becomes ready shortly after; a persistent failure points to a cluster that
 * is down, unreachable, or pointed at by the wrong context.
 */
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
