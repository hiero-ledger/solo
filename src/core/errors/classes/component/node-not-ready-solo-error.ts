// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeNotReadySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, expectedStatus: string, attempt: number, maxAttempts: number) {
    super({
      message: `Node '${nodeAlias}' is not ${expectedStatus} [attempt = ${attempt}/${maxAttempts}]`,
      code: ErrorCodeRegistry.NODE_NOT_READY,
      troubleshootingSteps:
        'Check node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\nView node logs: kubectl logs -n <namespace> <pod>\nReview solo logs: tail -f ~/.solo/logs/solo.log | jq',
    });
  }
}
