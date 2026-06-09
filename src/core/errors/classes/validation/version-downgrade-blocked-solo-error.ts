// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class VersionDowngradeBlockedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(componentName: string, targetVersion: string, currentVersion: string, flagHint: string) {
    super({
      message:
        `${componentName} upgrade target version ${targetVersion} is older than the currently deployed version ` +
        `${currentVersion}. Use ${flagHint} to specify a version equal to or newer than the currently deployed version.`,
      code: ErrorCodeRegistry.VERSION_DOWNGRADE_BLOCKED,
      troubleshootingSteps:
        `Specify a version equal to or newer than the currently deployed version (${currentVersion}) using ${flagHint}\n` +
        'Downgrades are not supported — check the available releases before upgrading',
    });
  }
}
