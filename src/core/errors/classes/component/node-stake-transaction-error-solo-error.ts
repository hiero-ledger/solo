// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeStakeTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute staking transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_STAKE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify the treasury account has sufficient HBAR balance.\n' +
          'Confirm the node is in ACTIVE status: kubectl get pods -n <namespace> -l solo.hedera.com/type=network-node\n' +
          'Check gRPC connectivity to the consensus node.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
