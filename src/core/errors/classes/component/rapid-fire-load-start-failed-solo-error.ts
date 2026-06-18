// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot start a rapid-fire load run; the underlying failure is wrapped in `cause`. This
 * step launches the load generator against the network, so this means startup failed — for example the
 * load-test workload could not be created or scheduled. It is retryable, since transient cluster issues
 * often clear on a later attempt.
 */
export class RapidFireLoadStartFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error running rapid-fire load start: ${cause.message}`,
        code: ErrorCodeRegistry.RAPID_FIRE_LOAD_START_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check NLG pod status: kubectl get pods -n <namespace> -l app.kubernetes.io/instance=network-load-generator\n' +
          'Describe NLG pods for scheduling or image-pull errors: ' +
          'kubectl describe pods -n <namespace> -l app.kubernetes.io/instance=network-load-generator\n' +
          'Check the NLG Helm release: helm status network-load-generator -n <namespace>',
      },
      cause,
    );
  }
}
