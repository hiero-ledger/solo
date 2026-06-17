// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot install a Helm chart; the message names the chart and wraps the underlying
 * failure in `cause`. solo installs charts to deploy its components, so this means the Helm install failed
 * — for example a bad chart version or values, an image that cannot be pulled, or a cluster that is
 * unreachable or short on resources. It is retryable, since transient registry or cluster issues often
 * clear on a later attempt.
 */
export class ChartInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chartName: string, cause: Error) {
    super(
      {
        message: `Error installing chart ${chartName}: ${cause.message}`,
        code: ErrorCodeRegistry.CHART_INSTALL_FAILED,
        troubleshootingSteps:
          'Check Helm release status: helm list -n <namespace>\n' +
          'Review Helm errors: helm status <chartName> -n <namespace>\n' +
          'Verify the cluster is reachable: kubectl cluster-info --context <context>\n' +
          'Retry after inspecting solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
