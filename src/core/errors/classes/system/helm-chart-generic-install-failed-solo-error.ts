// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot install a Helm chart release; the message names the release and wraps the
 * underlying failure in `cause`. This is the generic install failure used by the Helm client, so it means
 * the `helm install` did not succeed — for example a bad chart version or values, an image that cannot be
 * pulled, or a cluster that is unreachable or short on resources.
 */
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
