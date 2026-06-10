// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
