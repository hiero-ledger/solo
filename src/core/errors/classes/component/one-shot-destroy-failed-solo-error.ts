// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class OneShotDestroyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error destroying Solo in one-shot mode: ${cause.message}`,
        code: ErrorCodeRegistry.ONE_SHOT_DESTROY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'List remaining Helm releases: helm list -A\n' +
          'Delete stuck resources manually: kubectl delete <resource> -n <namespace>',
      },
      cause,
    );
  }
}
