// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
