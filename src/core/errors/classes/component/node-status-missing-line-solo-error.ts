// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a consensus node's status check response is missing the expected status line. solo parses the
 * status output to read the node's current state, so this means the response came back but did not contain
 * the line solo needs — usually because the node is still starting and has not produced full status output,
 * or the output format was unexpected.
 */
export class NodeStatusMissingLineSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Node status check response is missing the status line',
      code: ErrorCodeRegistry.NODE_STATUS_MISSING_LINE,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify the consensus node pod is running: kubectl get pods -n <namespace>\n' +
        'Inspect node logs: kubectl logs <node-pod> -n <namespace>',
    });
  }
}
