// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when creating a Hedera account through the SDK fails; the underlying failure is wrapped in
 * `cause`. solo creates accounts (for example operator or treasury accounts) during network setup, so this
 * means the create transaction did not succeed — commonly because the network rejected it (insufficient
 * payer balance, key problems) or the consensus node could not be reached.
 */
export class AccountCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Account creation failed: ${cause.message}`,
        code: ErrorCodeRegistry.ACCOUNT_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
          'Check node logs for errors: kubectl logs <node-pod> -n <namespace>\n' +
          'Create a new account: solo ledger account create',
      },
      cause,
    );
  }
}
