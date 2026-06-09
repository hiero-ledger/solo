// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DependencyInstallDirectoryConflictSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Installation directory cannot be the same as the temporary directory',
      code: ErrorCodeRegistry.DEPENDENCY_INSTALL_DIR_CONFLICT,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Configure separate installation and temporary directories in your Solo configuration',
    });
  }
}
