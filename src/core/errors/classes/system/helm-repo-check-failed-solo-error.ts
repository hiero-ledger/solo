// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot check the configured Helm chart repositories; the underlying failure is wrapped
 * in `cause`. solo verifies repositories before installing charts from them, so this means that check
 * failed — for example the Helm CLI errored or a repository was unreachable.
 */
export class HelmRepoCheckFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to check Helm chart repositories: ${cause.message}`,
        code: ErrorCodeRegistry.HELM_REPO_CHECK_FAILED,
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
