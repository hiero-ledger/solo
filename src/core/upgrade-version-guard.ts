// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../business/utils/semantic-version.js';
import {SoloError} from './errors/solo-error.js';

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
