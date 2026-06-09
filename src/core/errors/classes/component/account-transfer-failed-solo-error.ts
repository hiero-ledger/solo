// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class AccountTransferFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `HBAR transfer failed: ${cause.message}`,
        code: ErrorCodeRegistry.ACCOUNT_TRANSFER_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
          'Verify the sender account has sufficient HBAR balance',
      },
      cause,
    );
  }
}
