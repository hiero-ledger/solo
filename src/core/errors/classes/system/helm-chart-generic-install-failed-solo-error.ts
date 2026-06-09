// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class HelmChartGenericInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chartReleaseName: string, cause: Error) {
    super(
      {
        message: `Failed to install Helm chart '${chartReleaseName}': ${cause.message}`,
        code: ErrorCodeRegistry.HELM_CHART_GENERIC_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Inspect the Helm release: helm status ${chartReleaseName} -n <namespace>\n` +
          'Check Helm release history: helm history <release> -n <namespace>\n' +
          'Inspect failing pods: kubectl get pods -A',
      },
      cause,
    );
  }
}
