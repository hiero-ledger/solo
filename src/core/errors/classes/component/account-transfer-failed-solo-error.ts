// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an HBAR transfer transaction fails; the underlying failure is wrapped in `cause`. solo
 * transfers HBAR to fund accounts during setup and account operations, so this means the transfer was
 * rejected or could not be submitted — commonly an insufficient sender balance, a signing problem, or an
 * unreachable consensus node.
 */
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
