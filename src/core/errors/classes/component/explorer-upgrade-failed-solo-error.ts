// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo explorer node upgrade` cannot upgrade the Hiero Explorer; the underlying failure is
 * wrapped in `cause`. Upgrade re-applies the explorer Helm release at a new chart or version, so this means
 * the upgrade did not succeed — for example a Helm failure, an image that cannot be pulled, or
 * misconfigured values.
 */
export class ExplorerUpgradeFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error upgrading explorer: ${cause.message}`,
        code: ErrorCodeRegistry.EXPLORER_UPGRADE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect Helm release: helm status <release> -n <namespace>\n' +
          'View explorer pod logs: kubectl logs -n <namespace> <explorer-pod>',
      },
      cause,
    );
  }
}
