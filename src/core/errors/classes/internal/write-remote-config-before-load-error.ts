// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when code modifies or persists the remote configuration before it has
 * been loaded from the cluster. solo must load the remote config (a ConfigMap) into memory
 * before mutating it, so that writes are applied on top of the current cluster state rather
 * than an empty one; this guard fires when a command path attempts a write without that load
 * having run, or runs the steps out of order. It indicates a defect in solo itself.
 */
export class WriteRemoteConfigBeforeLoadError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Attempted to write remote config before it was loaded',
        code: ErrorCodeRegistry.WRITE_REMOTE_CONFIG_BEFORE_LOAD,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
    );
  }
}
