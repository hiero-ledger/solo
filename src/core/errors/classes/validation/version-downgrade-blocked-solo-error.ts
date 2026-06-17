// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an upgrade target version is older than the currently deployed version; the message names the
 * component, the target and current versions, and the flag to use. solo blocks downgrades to prevent
 * accidental rollbacks, so this means the requested version is too old — choose a version equal to or newer
 * than the deployed one.
 */
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
