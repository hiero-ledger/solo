// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when destroying a one-shot deployment fails; the underlying failure is wrapped in `cause`.
 * One-shot destroy tears down everything a one-shot deploy created, so this means that teardown did not
 * complete — for example a Helm release or cluster could not be removed, or the cluster API was
 * unreachable.
 */
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
