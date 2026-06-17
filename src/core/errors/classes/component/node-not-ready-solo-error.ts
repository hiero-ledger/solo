// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a consensus node does not reach the expected status within the allotted polling attempts; the
 * message names the node alias, the expected status, and the attempt count (`attempt/maxAttempts`). solo
 * polls node status while waiting for nodes to come up or change state, and raises this once the attempts
 * are exhausted without the node reaching the expected status — for example the node is crash-looping,
 * stuck during startup, or unable to join the network.
 */
export class NodeNotReadySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, expectedStatus: string, attempt: number, maxAttempts: number) {
    super({
      message: `Node '${nodeAlias}' is not ${expectedStatus} [attempt = ${attempt}/${maxAttempts}]`,
      code: ErrorCodeRegistry.NODE_NOT_READY,
      troubleshootingSteps:
        'Check node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
        'View node logs: kubectl logs -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
        'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
