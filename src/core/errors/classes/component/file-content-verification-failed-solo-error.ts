// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class FileContentVerificationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(message: string) {
    super({
      message,
      code: ErrorCodeRegistry.FILE_CONTENT_VERIFICATION_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running and healthy: kubectl get pods -n <namespace>\n' +
        'Inspect node logs for errors: kubectl logs <node-pod> -n <namespace>',
    });
  }
}
