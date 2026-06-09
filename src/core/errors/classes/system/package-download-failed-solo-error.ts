// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PackageDownloadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, cause: Error) {
    super(
      {
        message: `Failed to download package from ${url}: ${cause.message}`,
        code: ErrorCodeRegistry.PACKAGE_DOWNLOAD_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify network connectivity\n' +
          'Check if proxy or firewall settings block access to the download URL\n' +
          'Verify the download URL is accessible',
      },
      cause,
      {url},
    );
  }
}
