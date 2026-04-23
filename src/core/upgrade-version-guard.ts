// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../business/utils/semantic-version.js';
import {SoloError} from './errors/solo-error.js';

/**
 * Throws if the target upgrade version is older than the currently deployed version.
 * Same-version (equal) and newer-version upgrades are allowed.
 *
 * @param componentName - human-readable name for the error message (e.g. "Block node")
 * @param targetVersion - the version the user wants to upgrade to
 * @param currentVersion - the version currently deployed (from remote config), or undefined/null if not yet deployed
 * @param flagHint - the CLI flag to mention in the error message (e.g. "--upgrade-version")
 */
export function assertUpgradeVersionNotOlder(
  componentName: string,
  targetVersion: string,
  currentVersion: SemanticVersion<string> | undefined | null,
  flagHint: string,
): void {
  if (!currentVersion || currentVersion.equals('0.0.0')) {
    return;
  }

  const targetSemVersion: SemanticVersion<string> = new SemanticVersion<string>(targetVersion);

  if (targetSemVersion.lessThan(currentVersion)) {
    throw new SoloError(
      `${componentName} upgrade target version ${targetVersion} is older than the current version ${currentVersion.toString()} stored in remote config. ` +
        `Use ${flagHint} to specify a version equal to or newer than the currently deployed version.`,
    );
  }
}
