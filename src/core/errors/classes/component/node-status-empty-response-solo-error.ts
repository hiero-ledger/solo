// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeStatusEmptyResponseSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Node status check returned an empty response',
      code: ErrorCodeRegistry.NODE_STATUS_EMPTY_RESPONSE,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify the consensus node pod is running: kubectl get pods -n <namespace>\n' +
        'Inspect node logs: kubectl logs <node-pod> -n <namespace>',
    });
  }
}
