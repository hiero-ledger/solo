// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class FileContentMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'File content verification failed: retrieved content does not match uploaded content',
      code: ErrorCodeRegistry.FILE_CONTENT_MISMATCH,
      troubleshootingSteps:
        'Retry the file upload — transient network issues can cause partial or corrupt writes\n' +
        'Check solo logs for chunk append errors: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are healthy: kubectl get pods -n <namespace>\n' +
        'Check node logs for transaction errors: kubectl logs <node-pod> -n <namespace>\n' +
        'Confirm no concurrent process modified the same Hedera file during the upload',
    });
  }
}
