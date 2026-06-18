// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot upload the `build.zip` artifact; the underlying failure is wrapped in `cause`.
 * solo uploads the packaged build so nodes can be provisioned from it, so this means the upload failed —
 * for example the source file was missing or unreadable, or the destination was unreachable. It is
 * retryable.
 */
export class NodeBuildUploadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to upload build.zip file: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_BUILD_UPLOAD_FAILED,
        troubleshootingSteps:
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=network-node\n' +
          'Inspect the pod for more detail: kubectl describe pod <pod> -n <namespace>',
      },
      cause,
    );
  }
}
