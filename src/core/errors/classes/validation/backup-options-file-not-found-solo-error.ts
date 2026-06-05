// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupOptionsFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(optionsFile: string) {
    super({
      message: `Restore options file not found: ${optionsFile}`,
      code: ErrorCodeRegistry.BACKUP_OPTIONS_FILE_NOT_FOUND,
      troubleshootingSteps:
        `Verify the options file exists at: ${optionsFile}\n` +
        'Run solo config ops restore-network --help for usage information',
    });
  }
}
