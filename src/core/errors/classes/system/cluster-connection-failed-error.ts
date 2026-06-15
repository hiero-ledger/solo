// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot reach the Kubernetes API server for the
 * given cluster reference. This is retryable and typically indicates a transient
 * network issue, a kubeconfig with an incorrect context, or a cluster that is
 * not yet running (e.g. a Kind cluster that has not been started).
 */
export class ClusterConnectionFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(clusterReference: string, context: string) {
    super({
      message: `Connection failed for cluster ${clusterReference} with context: ${context}`,
      code: ErrorCodeRegistry.CLUSTER_CONNECTION_FAILED,
      troubleshootingSteps:
        'Verify the kubeconfig context is correct and the cluster is reachable: kubectl cluster-info --context <context>',
    });
  }
}
