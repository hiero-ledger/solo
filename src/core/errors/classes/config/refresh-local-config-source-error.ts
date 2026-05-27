// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
