// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot read the values of a deployed Helm release; the underlying failure is wrapped
 * in `cause`. solo reads them to carry install-time values across a chart upgrade, so continuing would silently drop
 * them — for example the Helm CLI errored or the cluster API was unreachable.
 */
export class HelmReleaseValuesReadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(releaseName: string, cause: Error) {
    super(
      {
        message: `Failed to read values of Helm release '${releaseName}': ${cause.message}`,
        code: ErrorCodeRegistry.HELM_RELEASE_VALUES_READ_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl cluster-info\n' +
          `Read the release values manually: helm get values ${releaseName} -n <namespace>\n` +
          'Retry the upgrade once the cluster API is reachable',
      },
      cause,
    );
  }
}
