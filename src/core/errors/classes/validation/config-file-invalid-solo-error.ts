// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a configuration file is empty or contains invalid content. solo reads this file to drive a
 * command, so this means it had no usable content — for example an empty file or content that does not
 * match the expected format.
 */
export class ConfigFileInvalidSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Configuration file is empty or contains invalid content',
      code: ErrorCodeRegistry.CONFIG_FILE_INVALID,
      troubleshootingSteps:
        'Verify the configuration file is a valid YAML or JSON document\n' +
        'Check that the file is not empty and contains the expected fields\n' +
        'Run solo config ops backup to export a valid configuration for reference',
    });
  }
}
