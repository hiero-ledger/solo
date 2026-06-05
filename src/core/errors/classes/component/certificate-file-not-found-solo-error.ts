// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class CertificateFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(input: string, type: string, line: number, index: number) {
    super({
      message: `Certificate file not found at path '${input}' for ${type} input at line ${line}, index ${index}`,
      code: ErrorCodeRegistry.CERTIFICATE_FILE_NOT_FOUND,
      troubleshootingSteps:
        `Verify the file exists at the path: ${input}\n` +
        'Ensure the path is absolute or relative to the working directory\n' +
        'Check file permissions allow reading the certificate file',
    });
  }
}
