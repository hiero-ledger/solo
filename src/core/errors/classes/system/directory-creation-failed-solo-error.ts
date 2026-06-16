// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create a directory; the underlying failure is wrapped in `cause`. solo creates
 * working and output directories as it runs, so this means the directory could not be created — for example
 * missing permissions, a read-only or full disk, or a conflicting existing path.
 */
export class DirectoryCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to create directory: ${cause.message}`,
        code: ErrorCodeRegistry.DIRECTORY_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the parent directory exists and is writable\n' +
          'Check available disk space',
      },
      cause,
    );
  }
}
