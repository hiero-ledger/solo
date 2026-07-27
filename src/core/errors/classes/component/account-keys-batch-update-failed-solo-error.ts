// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a batch key-update over several accounts does not fully succeed; the message reports how many
 * accounts were not updated. solo updates account keys in bulk during setup and raises this when one or
 * more of those updates is rejected — typically due to signing or key problems on the affected accounts, or
 * transient network failures while submitting the batch.
 */
export class AccountKeysBatchUpdateFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(rejectedCount: number) {
    super({
      message: `Account keys batch update failed: ${rejectedCount} accounts were not updated`,
      code: ErrorCodeRegistry.ACCOUNT_KEYS_BATCH_UPDATE_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Verify operator account has sufficient permissions\n' +
        'Update individual accounts: solo ledger account update',
    });
  }
}
