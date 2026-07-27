// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a configuration file referenced by a flag does not exist; the message names the flag and the
 * absolute and relative paths tried. solo reads the file from the provided path, so this means it is
 * missing or the path is wrong — for example a typo or a relative path resolved from an unexpected
 * directory.
 */
export class ConfigFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string, absolutePath: string, relativePath: string) {
    super({
      message: `Configuration file does not exist for: ${flagName}, absolute path: ${absolutePath}, path: ${relativePath}`,
      code: ErrorCodeRegistry.CONFIG_FILE_NOT_FOUND,
      troubleshootingSteps:
        'Verify the file exists: ls -la <absolutePath>\n' +
        'Set the correct file path for the --<flagName> flag\n' +
        'Run with --help for configuration file flags: solo consensus node setup --help',
    });
  }
}
