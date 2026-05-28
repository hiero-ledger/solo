// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
