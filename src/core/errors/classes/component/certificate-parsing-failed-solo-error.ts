// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class CertificateParsingFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(input: string, type: string, line: number, index: number) {
    super({
      message: `Failed to parse ${type} input '${input}' at line ${line}, index ${index}`,
      code: ErrorCodeRegistry.CERTIFICATE_PARSING_FAILED,
      troubleshootingSteps:
        'Verify the certificate input format is correct for the expected type\n' +
        `Check the value at line ${line}, position ${index} of the input\n` +
        'Ensure certificate values are properly formatted (PEM or DER encoded)',
    });
  }
}
