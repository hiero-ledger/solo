// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeDebugArchiveFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to create debug archive: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_DEBUG_ARCHIVE_FAILED,
        troubleshootingSteps:
          'Verify the output directory is writable\n' +
          'Check available disk space: df -h\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
