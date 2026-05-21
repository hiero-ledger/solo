// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeBuildCopyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error in copying local build to node: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_BUILD_COPY_FAILED,
        troubleshootingSteps:
          'Check pod status: kubectl get pods -n <namespace>\nVerify local build path is valid and readable\nReview logs: tail -f ~/.solo/logs/solo.log | jq',
      },
      cause,
    );
  }
}
