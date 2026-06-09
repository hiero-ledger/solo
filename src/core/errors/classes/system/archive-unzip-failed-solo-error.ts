// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ArchiveUnzipFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(sourcePath: string, cause: Error) {
    super(
      {
        message: `Failed to unzip ${sourcePath}: ${cause.message}`,
        code: ErrorCodeRegistry.ARCHIVE_UNZIP_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the archive is a valid zip file: ${sourcePath}\n` +
          'Ensure the archive is not corrupted\n' +
          'Check available disk space in the destination',
      },
      cause,
    );
  }
}
