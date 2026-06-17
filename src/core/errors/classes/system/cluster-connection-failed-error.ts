// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot establish a connection to the Kubernetes API server
 * for a cluster reference; the message names the cluster reference and the kubeconfig context
 * it tried. solo resolves the context from kubeconfig and connects before running any cluster
 * operation, so this fires when that handshake fails: the context names a server that is
 * unreachable or no longer exists, the cluster has not been started yet (for example a Kind
 * cluster that was never created or was deleted), credentials have expired, or a transient
 * network/DNS problem interrupted the call. It is retryable because a cluster that is still
 * coming up, or a brief network blip, often resolves on a later attempt.
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
