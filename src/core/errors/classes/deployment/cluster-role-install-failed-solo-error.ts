// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
