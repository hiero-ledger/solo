// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot check whether a Kubernetes ClusterRole exists; the message names the role and
 * wraps the underlying failure in `cause`. solo queries for ClusterRoles before installing or relying on
 * them, so this means the lookup failed — for example the Kubernetes API was unreachable or the current
 * user lacks permission to read ClusterRoles.
 */
export class ClusterRoleCheckFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(clusterRoleName: string, cause: Error) {
    super(
      {
        message: `Failed to check if ClusterRole exists: ${clusterRoleName}: ${cause.message}`,
        code: ErrorCodeRegistry.CLUSTER_ROLE_CHECK_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify RBAC permissions: kubectl get clusterroles\n' +
          'Inspect cluster state: kubectl get pods -A',
      },
      cause,
    );
  }
}
