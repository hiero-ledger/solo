// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot persist the local configuration to disk at
 * `~/.solo/local-config.yaml` (or `$SOLO_HOME/local-config.yaml`). The local config is
 * rewritten whenever solo records a new cluster reference, deployment, or context, and this
 * error wraps the underlying filesystem failure (`cause`). It means the data was prepared but
 * could not be written: typical causes are missing write permissions on the `~/.solo`
 * directory, a read-only or full disk, or a parent directory that is missing or locked.
 */
export class WriteLocalConfigFileError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Failed to write local configuration file',
        code: ErrorCodeRegistry.WRITE_LOCAL_CONFIG,
        troubleshootingSteps: 'Check file system permissions for ~/.solo',
      },
      cause,
    );
  }
}
