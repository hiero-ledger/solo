// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the backup configuration file is empty or invalid. solo reads this file to drive a backup or
 * restore, so this means it contained no usable configuration — for example an empty file or content that
 * does not match the expected format.
 */
export class BackupConfigInvalidSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Backup configuration file is empty or invalid',
      code: ErrorCodeRegistry.BACKUP_CONFIG_INVALID,
      troubleshootingSteps:
        'Verify the configuration file is a valid YAML or JSON document and is not empty\n' +
        'Export a new backup to generate a valid configuration file: solo config ops backup',
    });
  }
}
