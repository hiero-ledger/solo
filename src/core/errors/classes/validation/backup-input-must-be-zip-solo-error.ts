// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BackupInputMustBeZipSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Input path must be a .zip file when using --zip-password',
      code: ErrorCodeRegistry.BACKUP_INPUT_MUST_BE_ZIP,
      troubleshootingSteps:
        'Provide a .zip archive as the input path when using --zip-password\n' +
        'Run solo config ops restore-clusters --help for usage information',
    });
  }
}
