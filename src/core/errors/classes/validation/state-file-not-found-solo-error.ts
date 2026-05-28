// SPDX-License-Identifier: Apache-2.0

import {ErrorOwnership} from '../../error-ownership.js';
import {SoloError} from '../../solo-error.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class StateFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(path: string) {
    super({
      message: `State file does not exist or is not a regular file: ${path}`,
      code: ErrorCodeRegistry.STATE_FILE_NOT_FOUND,
      troubleshootingSteps:
        `Verify the file exists and is a regular file: ls -la ${path}\n` +
        'Make sure the path points to a .zip file, not a directory or missing symlink target.\n' +
        'When using a directory, pass the parent directory; Solo looks under <path>/states/<cluster>/<namespace>.',
    });
  }
}
