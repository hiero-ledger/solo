// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
