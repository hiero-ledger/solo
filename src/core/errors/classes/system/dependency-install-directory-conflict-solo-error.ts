// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the chosen installation directory is the same as the temporary directory used during install.
 * solo installs managed dependencies (such as kubectl, helm, kind) into a target directory distinct from
 * its temp workspace, so this means the configured paths collide — choose a different installation
 * directory.
 */
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
