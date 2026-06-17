// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create a tar archive from a source path; the message names the source and wraps
 * the underlying failure in `cause`. solo packages directories into tar archives (for example to bundle
 * state or logs), so this means the archiving step failed — for example the source path was unreadable, a
 * file changed during archiving, or the destination could not be written.
 */
export class ArchiveTarFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(sourcePath: string, cause: Error) {
    super(
      {
        message: `Failed to create tar archive from ${sourcePath}: ${cause.message}`,
        code: ErrorCodeRegistry.ARCHIVE_TAR_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the source path exists and is readable: ${sourcePath}\n` +
          'Check available disk space for the output archive',
      },
      cause,
    );
  }
}
