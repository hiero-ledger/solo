// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the backup configuration file does not exist; the message names the path. solo reads this
 * file to run a backup or restore, so this means it is missing or the path is wrong — for example a typo or
 * a file that was moved.
 */
export class BackupConfigNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(configFilePath: string) {
    super({
      message: `Backup configuration file not found: ${configFilePath}`,
      code: ErrorCodeRegistry.BACKUP_CONFIG_NOT_FOUND,
      troubleshootingSteps:
        `Verify the configuration file exists at: ${configFilePath}\n` +
        'Export a new backup to generate a configuration file: solo config ops backup',
    });
  }
}
