// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during cluster setup when the `pod-monitor-role` ClusterRole cannot be
 * installed; the underlying failure is wrapped in `cause`. This ClusterRole grants the
 * monitoring stack permission to scrape pods cluster-wide, so it is created as part of `solo
 * cluster-ref config setup`. The failure most often means the current kubeconfig user lacks the
 * RBAC permission to create ClusterRoles, but it can also stem from an API server that is
 * unreachable or rejected the request.
 */
export class ClusterRoleInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(installError: Error) {
    super(
      {
        message: `pod-monitor-role ClusterRole installation failed: ${installError.message}`,
        code: ErrorCodeRegistry.CLUSTER_ROLE_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify RBAC permissions: kubectl get clusterroles\n' +
          'Inspect cluster state: kubectl get pods -A',
      },
      installError,
    );
  }
}
