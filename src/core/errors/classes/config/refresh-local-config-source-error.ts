// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo fails to reload the local configuration from its on-disk
 * source — that is, the re-read and re-parse of `~/.solo/local-config.yaml` (or
 * `$SOLO_HOME/local-config.yaml`) did not complete; the underlying failure is wrapped in
 * `cause`. Unlike `LocalConfigNotFoundSoloError`, the file is present: it could not be read
 * (insufficient permissions, an I/O error) or its contents could not be parsed into the
 * expected configuration because the file is malformed or corrupt.
 */
export class RefreshLocalConfigSourceError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Failed to refresh local configuration source',
        code: ErrorCodeRegistry.REFRESH_LOCAL_CONFIG_SOURCE,
        troubleshootingSteps:
          'Check file system permissions for ~/.solo\n' + 'Verify the config file exists: solo deployment config info',
      },
      cause,
    );
  }
}
