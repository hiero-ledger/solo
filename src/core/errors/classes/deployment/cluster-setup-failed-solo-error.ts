// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo cluster-ref config setup` fails to install the
 * required cluster-level Helm charts (Prometheus, MinIO, metrics-server, etc.).
 * Can be caused by Helm failures, image pull errors, or insufficient cluster resources.
 */
export class ClusterSetupFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Cluster setup failed: ${cause.message}`,
        code: ErrorCodeRegistry.CLUSTER_SETUP_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'List installed Helm releases: helm list -A\n' +
          'Inspect cluster pods: kubectl get pods -A\n' +
          'Re-run cluster setup: solo cluster-ref config setup',
      },
      cause,
    );
  }
}
