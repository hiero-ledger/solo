// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupNoLogFilesSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(context: string) {
    super({
      message: `No log files found to restore in context: ${context}`,
      code: ErrorCodeRegistry.BACKUP_NO_LOG_FILES,
      troubleshootingSteps:
        `Verify the backup archive contains log files for context '${context}'\n` +
        'Check the backup directory structure for expected log files\n' +
        'Re-export the backup to include log files: solo config ops backup',
    });
  }
}
