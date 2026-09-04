// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during cluster setup when the metrics-server Helm chart fails to install;
 * the underlying failure is wrapped in `cause`. metrics-server provides the resource-usage
 * metrics API the cluster-level stack depends on, installed as part of `solo cluster-ref config
 * setup`. The failure is usually a Helm error (bad chart version or values), an image that
 * cannot be pulled, or a cluster lacking the resources/connectivity to schedule the pod.
 */
export class MetricsServerInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `metrics-server chart installation failed: ${cause.message}`,
        code: ErrorCodeRegistry.METRICS_SERVER_INSTALL_FAILED,
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
