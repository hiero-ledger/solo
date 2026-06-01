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
          'Check pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=network-node\n' +
          'Verify the local build path is valid and readable\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
