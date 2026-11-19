// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the release signature or the downloaded binary checksum does not verify; the message gives the reason. The update is refused and nothing on disk was replaced.
 */
export class SelfUpdateVerificationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(tag: string, reason: string, cause?: Error) {
    super(
      {
        message: `Refusing to install Solo ${tag}: ${reason}`,
        code: ErrorCodeRegistry.SELF_UPDATE_VERIFICATION_FAILED,
        troubleshootingSteps:
          'Re-run: solo update; a corrupted download is not kept\n' +
          'If it keeps failing, report it at https://github.com/hiero-ledger/solo/issues',
      },
      cause,
    );
  }
}
