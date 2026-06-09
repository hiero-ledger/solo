// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class HelmChartUpgradeFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chartReleaseName: string, cause: Error) {
    super(
      {
        message: `Failed to upgrade Helm chart '${chartReleaseName}': ${cause.message}`,
        code: ErrorCodeRegistry.HELM_CHART_UPGRADE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Inspect the release status: helm status ${chartReleaseName} -n <namespace>\n` +
          `Review upgrade history: helm history ${chartReleaseName} -n <namespace>\n` +
          'Check failing pods: kubectl get pods -A',
      },
      cause,
    );
  }
}
