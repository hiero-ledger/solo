// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a release asset or the latest-release lookup cannot be fetched during `solo update`; the message names the URL. Nothing on disk was replaced.
 */
export class SelfUpdateDownloadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, cause?: Error) {
    super(
      {
        message: `Failed to download ${url} while updating Solo`,
        code: ErrorCodeRegistry.SELF_UPDATE_DOWNLOAD_FAILED,
        troubleshootingSteps:
          'Confirm the machine can reach github.com\n' +
          'Re-run: solo update\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
