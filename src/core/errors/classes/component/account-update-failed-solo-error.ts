// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when updating a Hedera account's properties fails; the message names the account. solo submits an
 * account-update transaction to change account settings, so this means that transaction did not succeed —
 * for example the account's key did not sign, the requested change was invalid, or the network rejected or
 * could not be reached.
 */
export class AccountUpdateFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(accountId: string) {
    super({
      message: `Failed to update account ${accountId}`,
      code: ErrorCodeRegistry.ACCOUNT_UPDATE_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Verify the account exists on the network: solo ledger account update',
    });
  }
}
