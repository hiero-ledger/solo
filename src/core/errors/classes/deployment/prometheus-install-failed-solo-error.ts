// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during cluster setup when the Prometheus stack Helm chart fails to
 * install; the underlying failure is wrapped in `cause`. The Prometheus stack supplies the
 * monitoring and metrics collection for the cluster-level stack installed by `solo cluster-ref
 * config setup`. The failure is typically a Helm error (bad chart version or values), an image
 * that cannot be pulled, or a cluster without the resources/connectivity to schedule its pods.
 */
export class PrometheusInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Prometheus Stack chart installation failed: ${cause.message}`,
        code: ErrorCodeRegistry.PROMETHEUS_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect cluster pods: kubectl get pods -A\n' +
          'Check Helm release status: helm list -A\n' +
          'Verify cluster connectivity: kubectl cluster-info',
      },
      cause,
    );
  }
}
