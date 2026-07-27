// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo block node collect-jfr` cannot collect the Java Flight Recorder recording from a
 * block node; the underlying failure is wrapped in `cause`. Retryable, since a transient pod or cluster-API problem
 * often clears on a later attempt.
 */
export class BlockNodeJfrCollectionFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error collecting Java Flight Recorder recording from block node: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_JFR_COLLECTION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect block node pods: kubectl get pods -A -l block-node.hiero.com/type=block-node\n' +
          'Verify the block node was deployed with Java Flight Recorder enabled\n' +
          'Verify the cluster is reachable: kubectl cluster-info --context <context>',
      },
      cause,
    );
  }
}
