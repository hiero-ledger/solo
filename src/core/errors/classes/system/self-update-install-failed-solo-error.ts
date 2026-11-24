// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the downloaded binary does not run on this machine or cannot be renamed over the current binary; the message gives the reason. The current binary was left untouched.
 */
export class SelfUpdateInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(tag: string, reason: string, cause?: Error) {
    super(
      {
        message: `Failed to install Solo ${tag}: ${reason}`,
        code: ErrorCodeRegistry.SELF_UPDATE_INSTALL_FAILED,
        troubleshootingSteps:
          'Confirm the disk has free space and the binary folder is writable\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
