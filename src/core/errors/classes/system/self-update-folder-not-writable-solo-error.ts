// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown before any download when the folder holding the running binary is not writable, for example a system-wide install; the troubleshooting step prints the install-script command to run with elevated rights.
 */
export class SelfUpdateFolderNotWritableSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(folder: string, installCommand: string, cause?: Error) {
    super(
      {
        message: `Cannot update Solo: ${folder} is not writable`,
        code: ErrorCodeRegistry.SELF_UPDATE_FOLDER_NOT_WRITABLE,
        troubleshootingSteps: `Re-install with elevated rights: ${installCommand}`,
      },
      cause,
    );
  }
}
