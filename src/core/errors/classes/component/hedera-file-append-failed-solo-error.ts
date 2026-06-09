// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class HederaFileAppendFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chunkIndex: number, status: string) {
    super({
      message: `Hedera file append failed for chunk ${chunkIndex} with status: ${status}`,
      code: ErrorCodeRegistry.HEDERA_FILE_APPEND_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Consult the Hedera documentation for the meaning of the status code',
    });
  }
}
