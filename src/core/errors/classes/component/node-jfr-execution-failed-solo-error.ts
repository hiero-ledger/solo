// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Java Flight Recorder (JFR) operation on a consensus node pod fails; the message names the
 * operation and the pod. solo runs JFR commands inside the node container to capture profiling data, so
 * this means that command failed — for example the pod was not reachable or the command returned an error.
 * It is retryable.
 */
export class NodeJfrExecutionFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(operation: string, podName: string, cause?: Error) {
    super(
      {
        message: `${operation} on node pod ${podName}`,
        code: ErrorCodeRegistry.NODE_JFR_EXECUTION_FAILED,
        troubleshootingSteps:
          'Check if the node pod is running: kubectl get pod <podName> -n <namespace>\n' +
          'Verify the pod has jcmd available: kubectl exec <podName> -n <namespace> -- which jcmd\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
