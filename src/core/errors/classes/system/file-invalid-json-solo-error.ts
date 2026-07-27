// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a file solo was asked to parse does not contain valid JSON; the message names the path. solo
 * parses JSON from user-provided files, so this means the content could not be parsed — for example a
 * syntax error, a truncated file, or a non-JSON file supplied.
 */
export class FileInvalidJsonSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(filePath: string) {
    super({
      message: `File contains invalid JSON: ${filePath}`,
      code: ErrorCodeRegistry.FILE_INVALID_JSON,
      troubleshootingSteps:
        `Verify the file at ${filePath} contains valid JSON\n` +
        'Check for syntax errors such as missing commas, brackets, or quotes',
    });
  }
}
