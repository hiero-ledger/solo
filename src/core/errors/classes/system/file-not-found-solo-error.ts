// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class FileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(filePath: string) {
    super({
      message: `File does not exist: ${filePath}`,
      code: ErrorCodeRegistry.FILE_NOT_FOUND,
      troubleshootingSteps:
        `Verify the file exists at: ${filePath}\n` + 'Check the path is correct and the file has not been deleted',
    });
  }
}
