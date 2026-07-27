// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a file copy operation fails; the underlying failure is wrapped in `cause`. solo copies files
 * between local paths and pods during setup, so this means the copy did not complete — for example the
 * source was unreadable, the destination was not writable, or the connection dropped.
 */
export class FileCopyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `File copy operation failed: ${cause.message}`,
        code: ErrorCodeRegistry.FILE_COPY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the source file exists and is readable\n' +
          'Check that the destination directory exists and is writable\n' +
          'Verify sufficient disk space is available',
      },
      cause,
    );
  }
}
