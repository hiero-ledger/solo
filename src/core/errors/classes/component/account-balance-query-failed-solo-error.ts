// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {type AccountId} from '@hiero-ledger/sdk';

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
