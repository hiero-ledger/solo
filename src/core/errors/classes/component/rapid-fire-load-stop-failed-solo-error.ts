// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RapidFireLoadStopFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error running rapid-fire stop: ${cause.message}`,
        code: ErrorCodeRegistry.RAPID_FIRE_LOAD_STOP_FAILED,
        troubleshootingSteps:
          'Check solo logs for the root cause: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check NLG pod status: kubectl get pods -n <namespace> -l app.kubernetes.io/instance=network-load-generator\n' +
          'Check for running NLG Java processes: kubectl exec -n <namespace> <pod> -- ps aux | grep java\n' +
          'To force-stop, uninstall the NLG chart: helm uninstall network-load-generator -n <namespace>',
      },
      cause,
    );
  }
}
