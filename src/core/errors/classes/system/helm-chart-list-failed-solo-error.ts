// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot list installed Helm charts; the underlying failure is wrapped in `cause`. solo
 * lists releases to check what is installed, so this means the `helm list` failed — for example the Helm
 * CLI errored or the cluster API was unreachable.
 */
export class HelmChartListFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to list installed Helm charts: ${cause.message}`,
        code: ErrorCodeRegistry.HELM_CHART_LIST_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl cluster-info\n' +
          'List Helm releases manually: helm list -A',
      },
      cause,
    );
  }
}
