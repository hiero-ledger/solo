// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class LocalBuildPathNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(localBuildPath: string) {
    super({
      message: `Local build path does not exist: ${localBuildPath}`,
      code: ErrorCodeRegistry.LOCAL_BUILD_PATH_NOT_FOUND,
      troubleshootingSteps:
        'Verify the path exists: ls -la <localBuildPath>\n' +
        'Set the correct path: solo consensus node setup --local-build-path <path>\n' +
        'Build the platform locally and point to the data/ directory output',
    });
  }
}
