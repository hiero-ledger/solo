// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot fetch a requested upgrade version; the message names the version and wraps the
 * underlying failure in `cause`. solo downloads upgrade artifacts for the chosen version, so this means the
 * fetch did not complete — for example the version assets were unreachable or the download errored. It is
 * retryable, since transient network issues often clear on a later attempt.
 */
export class UpgradeVersionFetchFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(upgradeVersion: string, cause: Error) {
    super(
      {
        message: `Failed to fetch upgrade version ${upgradeVersion}: ${cause.message}`,
        code: ErrorCodeRegistry.UPGRADE_VERSION_FETCH_FAILED,
        troubleshootingSteps:
          'Check internet connectivity\n' +
          'Verify the version exists: https://github.com/hashgraph/hedera-services/releases\n' +
          'Retry the upgrade: solo consensus network upgrade --upgrade-version <version>',
      },
      cause,
    );
  }
}
