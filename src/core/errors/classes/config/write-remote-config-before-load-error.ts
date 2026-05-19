// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {BUG_REPORT_URL} from '../../../constants.js';

export class WriteRemoteConfigBeforeLoadError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Attempted to write remote config before it was loaded',
        code: ErrorCodeRegistry.WRITE_REMOTE_CONFIG_BEFORE_LOAD,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${BUG_REPORT_URL}`,
      },
      cause,
    );
  }
}
