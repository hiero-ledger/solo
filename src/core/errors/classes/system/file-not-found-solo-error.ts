// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a file solo was asked to use does not exist; the message names the path. solo reads files
 * from paths provided on the command line or in configuration, so this means the file is missing or the
 * path is wrong — for example a typo or a file that was moved or deleted.
 */
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
