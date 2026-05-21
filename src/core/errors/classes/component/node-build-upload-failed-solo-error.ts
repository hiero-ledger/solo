// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeBuildUploadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to upload build.zip file: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_BUILD_UPLOAD_FAILED,
        troubleshootingSteps:
          'Check node connectivity: kubectl get pods -n <namespace>\nReview file upload logs: tail -f ~/.solo/logs/solo.log | jq\nVerify the node is healthy before retrying: kubectl describe pod <pod> -n <namespace>',
      },
      cause,
    );
  }
}
