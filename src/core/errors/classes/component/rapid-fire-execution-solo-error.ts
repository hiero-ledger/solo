// SPDX-License-Identifier: Apache-2.0

import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {SoloError} from '../../solo-error.js';

/**
 * @description Thrown when a rapid-fire load test step fails to execute; the message describes the failing step and,
 * when present, wraps the underlying `cause`. Rapid-fire runs load against the network, so this means one
 * of its execution steps did not succeed. It is retryable, since transient cluster or network issues during
 * the test often clear on a later attempt.
 */
export class RapidFireExecutionSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(message: string, cause?: Error) {
    super(
      {
        message,
        code: ErrorCodeRegistry.RAPID_FIRE_EXECUTION_FAILED,
        troubleshootingSteps:
          'Check NLG pod logs for TPS output and errors: ' +
          'kubectl logs -n <namespace> -l app.kubernetes.io/instance=network-load-generator\n' +
          'Retry with lower load parameters or a reduced --max-tps value',
      },
      cause,
    );
  }
}
