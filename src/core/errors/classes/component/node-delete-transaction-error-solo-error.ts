// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeDeleteTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute node delete transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_DELETE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify the node admin key is correct and loaded from the k8s secret.\n' +
          'Confirm the node exists in the current address book.\n' +
          'Verify gossip endpoints and gRPC service endpoints are reachable from the network.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
