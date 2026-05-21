// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ConfigFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string, absolutePath: string, relativePath: string) {
    super({
      message: `Configuration file does not exist for: ${flagName}, absolute path: ${absolutePath}, path: ${relativePath}`,
      code: ErrorCodeRegistry.CONFIG_FILE_NOT_FOUND,
      troubleshootingSteps:
        'Verify the file exists: ls -la <absolutePath>\nSet the correct file path for the --<flagName> flag\nRun with --help for configuration file flags: solo node setup --help',
    });
  }
}
