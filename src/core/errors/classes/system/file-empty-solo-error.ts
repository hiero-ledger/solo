// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a file solo was asked to read is empty; the message names the path. solo expects the
 * referenced file to contain data, so this means it exists but has no content — for example the wrong file
 * was supplied or it was not fully written.
 */
export class FileEmptySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(filePath: string) {
    super({
      message: `File is empty: ${filePath}`,
      code: ErrorCodeRegistry.FILE_EMPTY,
      troubleshootingSteps:
        `Verify the file contains valid content: ${filePath}\n` + 'The file must not be empty to be processed',
    });
  }
}
