// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupInputDirectoryNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(inputDirectory: string) {
    super({
      message: `Input directory does not exist: ${inputDirectory}`,
      code: ErrorCodeRegistry.BACKUP_INPUT_DIR_NOT_FOUND,
      troubleshootingSteps:
        `Verify the directory exists at: ${inputDirectory}\n` +
        'Use --input-dir to specify the correct path to the backup directory\n' +
        'Run solo config ops restore-clusters --help for usage information',
    });
  }
}
