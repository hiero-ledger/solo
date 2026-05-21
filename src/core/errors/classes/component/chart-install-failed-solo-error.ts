// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ChartInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chartName: string, cause: Error) {
    super(
      {
        message: `Error installing chart ${chartName}: ${cause.message}`,
        code: ErrorCodeRegistry.CHART_INSTALL_FAILED,
        troubleshootingSteps:
          'Check Helm release status: helm list -n <namespace>\nReview Helm errors: helm status <chart> -n <namespace>\nVerify cluster connectivity: kubectl get nodes\nRetry after inspecting logs: tail -f ~/.solo/logs/solo.log | jq',
      },
      cause,
    );
  }
}
