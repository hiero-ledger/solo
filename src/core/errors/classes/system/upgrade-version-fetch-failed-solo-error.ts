// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
          'Retry the upgrade: solo node upgrade --upgrade-version <version>',
      },
      cause,
    );
  }
}
