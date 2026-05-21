// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BlockNodeConfigFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed while creating block-nodes configuration: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_CONFIG_FAILED,
        troubleshootingSteps:
          'Check block node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=block-node\nReview logs: tail -f ~/.solo/logs/solo.log | jq\nVerify cluster connectivity: kubectl get nodes',
      },
      cause,
    );
  }
}
