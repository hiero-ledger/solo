// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown by the `solo cluster-ref state` commands when the container engine is
 * reachable but no Kind cluster node container (a container carrying the `io.x-k8s.kind.cluster`
 * label) exists on it, running or stopped — there is no cluster to start, stop, or report on.
 * Typically the cluster was never created or was deleted (`kind delete cluster`).
 */
export class KindClusterContainerNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No Kind cluster container was detected on the local container engine',
      code: ErrorCodeRegistry.KIND_CLUSTER_CONTAINER_NOT_FOUND,
      troubleshootingSteps:
        'List existing Kind clusters: kind get clusters\n' +
        'Create a cluster with a full deployment: solo one-shot single deploy',
    });
  }
}
