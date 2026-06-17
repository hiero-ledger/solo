// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a local build path is missing the required `apps` and `lib` subdirectories; the message names
 * the path. solo expects a local platform build to contain both, so this means the path does not point at a
 * complete build.
 */
export class LocalBuildMissingSubdirectoriesSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(localBuildPath: string) {
    super({
      message: `Local build path '${localBuildPath}' must contain 'apps' and 'lib' subdirectories`,
      code: ErrorCodeRegistry.LOCAL_BUILD_MISSING_SUBDIRS,
      troubleshootingSteps:
        'Verify the directory structure: ls -la <localBuildPath>\n' +
        'Ensure the path points to the data/ directory of the Hedera platform build\n' +
        'Expected layout: <path>/apps/*.jar and <path>/lib/*.jar (set via --local-build-path)',
    });
  }
}
