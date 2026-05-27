// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeFreezeTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute freeze-only transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_FREEZE_ONLY_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify the node admin key is correct and loaded from the k8s secret.\n' +
          'Confirm the freeze admin account has the correct operator key set.\n' +
          'Verify the freeze admin account has sufficient HBAR balance.\n' +
          'Verify gossip endpoints and gRPC service endpoints are reachable from the network.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
