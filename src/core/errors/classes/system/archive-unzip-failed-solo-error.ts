// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot unzip an archive; the message names the source and wraps the underlying failure
 * in `cause`. solo unzips downloaded packages and state archives, so this means the unzip failed — for
 * example the zip is corrupt or truncated, a wrong password was supplied, or the destination could not be
 * written.
 */
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
