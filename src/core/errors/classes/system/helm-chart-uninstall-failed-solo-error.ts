// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class HelmChartUninstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chartReleaseName: string, cause: Error) {
    super(
      {
        message: `Failed to uninstall Helm chart '${chartReleaseName}': ${cause.message}`,
        code: ErrorCodeRegistry.HELM_CHART_UNINSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check if the release still exists: helm list -n <namespace>\n' +
          `Inspect the release status: helm status ${chartReleaseName} -n <namespace>\n` +
          'Check remaining pods: kubectl get pods -A',
      },
      cause,
    );
  }
}
