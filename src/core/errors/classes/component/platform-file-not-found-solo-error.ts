// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PlatformFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(sourcePath: string) {
    super({
      message: `Platform file does not exist: ${sourcePath}`,
      code: ErrorCodeRegistry.PLATFORM_FILE_NOT_FOUND,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        `Verify the file exists at: ${sourcePath}\n` +
        'Ensure the node build artifacts are present and the build path is correct',
    });
  }
}
