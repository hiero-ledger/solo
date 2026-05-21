// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeJfrExecutionFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(operation: string, podName: string, cause?: Error) {
    super(
      {
        message: `${operation} on node pod ${podName}`,
        code: ErrorCodeRegistry.NODE_JFR_EXECUTION_FAILED,
        troubleshootingSteps:
          'Check if the node pod is running: kubectl get pod <podName> -n <namespace>\nVerify the pod has jcmd available: kubectl exec <podName> -- which jcmd\nReview logs: tail -f ~/.solo/logs/solo.log | jq',
      },
      cause,
    );
  }
}
