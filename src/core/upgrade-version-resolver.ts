// SPDX-License-Identifier: Apache-2.0

import {type SemanticVersion} from '../business/utils/semantic-version.js';

/**
 * Resolves the version to use for a component helm upgrade.
 *
 * Applies the following precedence:
 *   1. the version the user explicitly supplied on the command line;
 *   2. the version currently recorded for the component in remote config (when present);
 *   3. the built-in default from version.ts.
 *
 * Without this, an upgrade that omits the version flag silently retargets the component to the
 * CLI's built-in default rather than the version that is actually deployed, forcing operators to
 * restate the version on every upgrade.
 */
export class UpgradeVersionResolver {
  /**
   * @param userSuppliedVersion - the flag value when the user explicitly supplied it, otherwise undefined
   * @param remoteConfigVersion - the component version recorded in remote config (0.0.0 when unknown)
   * @param fallbackDefault - the version.ts default to use when neither of the above is available
   */
  public static resolve(
    userSuppliedVersion: string | undefined,
    remoteConfigVersion: SemanticVersion<string> | undefined | null,
    fallbackDefault: string,
  ): string {
    if (userSuppliedVersion) {
      return userSuppliedVersion;
    }

    if (remoteConfigVersion && !remoteConfigVersion.equals('0.0.0')) {
      return remoteConfigVersion.toString();
    }

    return fallbackDefault;
  }
}
