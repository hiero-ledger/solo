// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class LocalBuildMissingSubdirsSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(localBuildPath: string) {
    super({
      message: `Local build path '${localBuildPath}' must contain 'apps' and 'lib' subdirectories`,
      code: ErrorCodeRegistry.LOCAL_BUILD_MISSING_SUBDIRS,
      troubleshootingSteps:
        'Verify the directory structure: ls -la <localBuildPath>\nEnsure the path points to the data/ directory of the Hedera platform build\nExpected layout: <path>/apps/*.jar and <path>/lib/*.jar',
    });
  }
}
