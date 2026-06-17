// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when updating the keys on a Hedera account fails; the message names the account. solo rotates
 * account keys (for example replacing genesis keys) with an update transaction, so this means that
 * transaction did not succeed — commonly because the existing key did not sign correctly, the new key is
 * invalid, or the network rejected or could not be reached.
 */
export class AccountKeyUpdateFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(accountId: string) {
    super({
      message: `Failed to update account keys for account ${accountId}`,
      code: ErrorCodeRegistry.ACCOUNT_KEY_UPDATE_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Verify the account ID is correct and the account exists on the network',
    });
  }
}
