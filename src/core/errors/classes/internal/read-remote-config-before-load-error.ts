// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when code reads the remote-configuration runtime state before it has
 * been loaded from the cluster. solo fetches the remote config (a ConfigMap) into memory in an
 * explicit load step that must run before any read, so this is a lifecycle guard: reaching it
 * means a command path accessed the remote config without first loading it, or ran the steps
 * out of order. It indicates a defect in solo rather than a user or infrastructure problem.
 */
export class ReadRemoteConfigBeforeLoadError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Attempted to read remote config before it was loaded',
        code: ErrorCodeRegistry.READ_REMOTE_CONFIG_BEFORE_LOAD,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
    );
  }
}
