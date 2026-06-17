// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo cluster-ref config reset` cannot tear down the cluster-level
 * resources that `setup` installed (the `solo-cluster-setup` chart and its components); the
 * underlying failure is wrapped in `cause`. It means the uninstall did not complete cleanly —
 * for example a Helm release could not be removed, or the cluster API was unreachable mid-reset
 * — so some resources may still be present. Inspect the remaining Helm releases and pods to see
 * what was left behind.
 */
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
