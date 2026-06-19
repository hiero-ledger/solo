// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../business/utils/semantic-version.js';
import {SoloErrors} from './errors/solo-errors.js';

export class UpgradeVersionGuard {
  public static assertUpgradeVersionNotOlder(
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
      throw new SoloErrors.validation.versionDowngradeBlocked(
        componentName,
        targetVersion,
        currentVersion.toString(),
        flagHint,
      );
    }
  }
}

export const assertUpgradeVersionNotOlder: typeof UpgradeVersionGuard.assertUpgradeVersionNotOlder =
  UpgradeVersionGuard.assertUpgradeVersionNotOlder;
