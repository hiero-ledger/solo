// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BlockNodePodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No block node pod found',
      code: ErrorCodeRegistry.BLOCK_NODE_POD_NOT_FOUND,
      troubleshootingSteps:
        'Check pod status: kubectl get pods -A -l block-node.hiero.com/type=block-node\n' +
        'Describe pods to check for crashes or evictions: kubectl describe pods -A -l block-node.hiero.com/type=block-node\n' +
        'Check recent namespace events: kubectl get events -n <namespace> --sort-by=.lastTimestamp',
    });
  }
}
