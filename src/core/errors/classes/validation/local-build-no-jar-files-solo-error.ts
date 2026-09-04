// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no jar files are found in a local build subdirectory; the message names the subdirectory.
 * solo expects the build subdirectories to contain jars, so this means the build is incomplete or the path
 * is wrong.
 */
export class LocalBuildNoJarFilesSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(subdirectory: string) {
    super({
      message: `No jar files found in '${subdirectory}'; please check your local build path`,
      code: ErrorCodeRegistry.LOCAL_BUILD_NO_JAR_FILES,
      troubleshootingSteps:
        'List files in the directory: ls -la <subdirectory>\n' +
        'Ensure a complete platform build was performed before using --local-build-path\n' +
        'Expected: <path>/apps/HederaNode.jar and <path>/lib/*.jar',
    });
  }
}
