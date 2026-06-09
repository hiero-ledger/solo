// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupInputPathNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(inputPath: string) {
    super({
      message: `Input path does not exist: ${inputPath}`,
      code: ErrorCodeRegistry.BACKUP_INPUT_PATH_NOT_FOUND,
      troubleshootingSteps:
        `Verify the input path exists: ${inputPath}\n` +
        'Use --input-dir or --zip-file to specify the correct backup path\n' +
        'Run solo config ops restore-clusters --help for usage information',
    });
  }
}
