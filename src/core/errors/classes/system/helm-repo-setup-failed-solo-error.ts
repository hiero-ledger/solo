// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot set up the Helm chart repositories; the underlying failure is wrapped in `cause`.
 * solo adds and updates the repositories its charts come from, so this means that setup failed — for
 * example a repository URL was unreachable or the Helm CLI errored.
 */
export class HelmRepoSetupFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to set up Helm chart repositories: ${cause.message}`,
        code: ErrorCodeRegistry.HELM_REPO_SETUP_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'List configured Helm repositories: helm repo list\n' +
          'Verify network connectivity to chart repository URLs\n' +
          'Update Helm repositories: helm repo update',
      },
      cause,
    );
  }
}
