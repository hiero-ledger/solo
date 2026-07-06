// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create the debug archive it assembles for troubleshooting; the underlying failure
 * is wrapped in `cause`. The archive bundles a node's logs and diagnostic data, and reaching this failure
 * points to a problem in solo's archive-creation logic rather than user or infrastructure input, so it is
 * treated as an internal Solo error and should be reported with the full error output.
 */
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
