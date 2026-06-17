// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot parse the backup configuration; the underlying failure is wrapped in `cause`.
 * solo parses the backup configuration to drive a restore, so this means the content could not be parsed —
 * for example malformed YAML or an unexpected structure.
 */
export class BackupConfigParseFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to parse backup configuration: ${cause.message}`,
        code: ErrorCodeRegistry.BACKUP_CONFIG_PARSE_FAILED,
        troubleshootingSteps:
          'Verify the backup configuration file is valid YAML or JSON\n' +
          'Check that the configuration was exported with a compatible Solo version\n' +
          'Re-export the backup to regenerate the configuration: solo config ops backup --deployment <deployment>',
      },
      cause,
    );
  }
}
