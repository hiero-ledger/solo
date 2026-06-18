// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot retrieve an account's information from the network via the SDK; the underlying
 * failure is wrapped in `cause`. It means the account-info query did not return — for example the account
 * does not exist, the consensus node is unreachable or not yet ACTIVE, or the SDK client is misconfigured.
 */
export class AccountInfoFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to retrieve account info: ${cause.message}`,
        code: ErrorCodeRegistry.ACCOUNT_INFO_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
          'Verify the account ID exists on the network',
      },
      cause,
    );
  }
}
