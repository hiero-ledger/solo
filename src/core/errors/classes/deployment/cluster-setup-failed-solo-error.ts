// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo cluster-ref config setup` cannot install the cluster-level
 * shared infrastructure that deployments depend on — the `solo-cluster-setup` chart and its
 * components (Prometheus, MinIO, metrics-server, and the cluster role). It wraps the
 * underlying failure (`cause.message`), which is most often a failed Helm release (bad chart
 * version or values), an image that cannot be pulled, missing RBAC permissions on the target
 * cluster, or a cluster that lacks the CPU/memory to schedule the new pods.
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
