// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Hedera File Service create transaction returns a non-success status; the message includes
 * the network status. solo uses the File Service to store artifacts on the network (such as upgrade files),
 * so this means the file create was rejected — the specific status code identifies why, for example a payer
 * or signature problem or an invalid file.
 */
export class HederaFileCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(status: string) {
    super({
      message: `Hedera file creation failed with status: ${status}`,
      code: ErrorCodeRegistry.HEDERA_FILE_CREATION_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
        'Consult the Hedera documentation for the meaning of the status code',
    });
  }
}
