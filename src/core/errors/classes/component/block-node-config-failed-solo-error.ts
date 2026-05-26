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
          'Check block node pod status: kubectl get pods -n <namespace> -l block-node.hiero.com/type=block-node\n' +
          'Check network node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=network-node\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the cluster is reachable: kubectl cluster-info --context <context>',
      },
      cause,
    );
  }
}
