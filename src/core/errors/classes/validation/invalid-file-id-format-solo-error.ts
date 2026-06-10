// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InvalidFileIdFormatSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(fileId: string) {
    super({
      message: `Invalid file ID format: ${fileId}. Expected format: 0.0.<number> (e.g., 0.0.150)`,
      code: ErrorCodeRegistry.INVALID_FILE_ID_FORMAT,
      troubleshootingSteps:
        'Provide a file ID in the format 0.0.<number> (e.g., 0.0.150)\n' +
        'Run solo ledger file --help for usage information',
    });
  }
}
