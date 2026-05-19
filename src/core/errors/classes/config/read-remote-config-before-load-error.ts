// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ReadRemoteConfigBeforeLoadError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Attempted to read remote config before it was loaded',
        code: ErrorCodeRegistry.READ_REMOTE_CONFIG_BEFORE_LOAD,
        troubleshootingSteps: 'This is an internal Solo error. File a bug report if it occurs in production',
      },
      cause,
    );
  }
}
