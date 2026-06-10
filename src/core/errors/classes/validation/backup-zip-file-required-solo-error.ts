// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupZipFileRequiredSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: '--zip-file is required when using --zip-password',
      code: ErrorCodeRegistry.BACKUP_ZIP_FILE_REQUIRED,
      troubleshootingSteps:
        'Provide the --zip-file flag when using --zip-password\n' +
        'Run solo config ops restore-clusters --help for usage information',
    });
  }
}
