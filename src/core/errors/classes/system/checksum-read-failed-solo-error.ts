// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ChecksumReadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(checksumFile: string) {
    super({
      message: `Unable to read checksum file: ${checksumFile}`,
      code: ErrorCodeRegistry.CHECKSUM_READ_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        `Verify the checksum file exists and is readable: ${checksumFile}\n` +
        'Re-download the package to regenerate the checksum file',
    });
  }
}
