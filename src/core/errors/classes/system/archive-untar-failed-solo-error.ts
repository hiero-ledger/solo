// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot extract a tar archive; the message names the archive and wraps the underlying
 * failure in `cause`. solo unpacks tar archives it downloads or restores, so this means extraction failed —
 * for example the archive is corrupt or truncated, or the destination directory could not be written.
 */
export class ArchiveUntarFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(sourcePath: string, cause: Error) {
    super(
      {
        message: `Failed to extract tar archive ${sourcePath}: ${cause.message}`,
        code: ErrorCodeRegistry.ARCHIVE_UNTAR_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the archive is a valid tar file: ${sourcePath}\n` +
          'Check the archive is not corrupted\n' +
          'Verify available disk space in the extraction destination',
      },
      cause,
    );
  }
}
