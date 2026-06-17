// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a file ID is not in the expected `0.0.<number>` format; the message includes the offending
 * value and an example. solo parses Hedera file IDs from input, so this means the value is malformed.
 */
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
