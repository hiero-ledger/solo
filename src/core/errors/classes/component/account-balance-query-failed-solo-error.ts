// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {type AccountId} from '@hiero-ledger/sdk';

/**
 * @description Thrown when solo cannot read an account's HBAR balance from the network via the Hedera SDK; the message
 * names the account and, when present, wraps the underlying `cause`. solo queries balances to verify
 * funding and confirm operations, so this is raised when the balance query does not return — typically
 * because the target consensus node is unreachable or not yet ACTIVE, or the SDK client is misconfigured.
 * It is retryable, since a transient network or node-readiness issue often clears on a later attempt.
 */
export class AccountBalanceQueryFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(accountId: AccountId | string, cause?: Error) {
    super(
      {
        message: `Failed to execute account balance query for account: ${accountId}; ${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.ACCOUNT_BALANCE_QUERY_FAILED,
        troubleshootingSteps:
          'Verify gossip endpoints and gRPC service endpoints are reachable from the network.\n' +
          'Confirm the account ID is valid and exists on the network.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
