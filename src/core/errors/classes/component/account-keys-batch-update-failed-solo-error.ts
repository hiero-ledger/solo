// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
