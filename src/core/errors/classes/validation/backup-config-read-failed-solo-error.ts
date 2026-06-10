// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupConfigReadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(configFilePath: string, cause: Error) {
    super(
      {
        message: `Failed to read backup configuration file ${configFilePath}: ${cause.message}`,
        code: ErrorCodeRegistry.BACKUP_CONFIG_READ_FAILED,
        troubleshootingSteps:
          `Verify the file exists and is readable: ${configFilePath}\n` +
          'Check file permissions\n' +
          'Export a new backup to regenerate the configuration file: solo config ops backup',
      },
      cause,
    );
  }
}
