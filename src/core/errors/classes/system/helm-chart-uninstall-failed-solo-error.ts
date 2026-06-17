// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot uninstall a Helm chart release; the message names the release and wraps the
 * underlying failure in `cause`. solo uninstalls releases during teardown, so this means the `helm
 * uninstall` did not complete — for example the release was not found, a resource could not be deleted, or
 * the cluster API was unreachable.
 */
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
