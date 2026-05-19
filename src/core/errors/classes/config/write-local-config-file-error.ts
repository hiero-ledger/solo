// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
