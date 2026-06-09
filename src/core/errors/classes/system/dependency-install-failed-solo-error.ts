// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DependencyInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(executableName: string, cause: Error) {
    super(
      {
        message: `Failed to install ${executableName}: ${cause.message}`,
        code: ErrorCodeRegistry.DEPENDENCY_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify network connectivity for downloading the dependency\n' +
          'Check available disk space\n' +
          'Re-run initialization: solo init',
      },
      cause,
    );
  }
}
