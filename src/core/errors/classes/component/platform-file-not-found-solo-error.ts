// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a platform file solo needs does not exist; the message names the path. solo reads platform
 * artifacts from expected locations during setup, so this means the file is missing — for example the
 * platform build was incomplete, an earlier download or extract step did not produce it, or the path is
 * wrong.
 */
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
