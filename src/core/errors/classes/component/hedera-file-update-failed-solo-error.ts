// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Hedera File Service update transaction returns a non-success status; the message includes
 * the network status. solo updates network-stored files (such as upgrade files) via the File Service, so
 * this means the update was rejected — the specific status code identifies why.
 */
export class HederaFileUpdateFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(status: string) {
    super({
      message: `Hedera file update failed with status: ${status}`,
      code: ErrorCodeRegistry.HEDERA_FILE_UPDATE_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Consult the Hedera documentation for the meaning of the status code',
    });
  }
}
