// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RapidFireKillFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(testClass: string, cause: Error) {
    super(
      {
        message: `Error stopping ${testClass} load test: ${cause.message}`,
        code: ErrorCodeRegistry.RAPID_FIRE_KILL_FAILED,
        troubleshootingSteps:
          `Check if the test process is still running: kubectl exec -n <namespace> <pod> -- ps aux | grep ${testClass}\n` +
          `Manually kill the process: kubectl exec -n <namespace> <pod> -- pkill -f ${testClass}\n` +
          'To stop the load test entirely, uninstall the NLG chart: helm uninstall network-load-generator -n <namespace>',
      },
      cause,
    );
  }
}
