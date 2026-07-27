// SPDX-License-Identifier: Apache-2.0

import {type SemanticVersion} from '../business/utils/semantic-version.js';
import {type ConfigManager} from './config-manager.js';
import {type CommandFlag} from '../types/flag-types.js';

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

  /**
   * Convenience wrapper around {@link resolve} that determines whether the version was
   * user-supplied itself, instead of leaving that check to the call site.
   *
   * @param configManager - used to check whether the user explicitly supplied any of `versionFlags`
   * @param versionFlags - all flags that can carry the version (e.g. relay's version and release-tag aliases)
   * @param flagValue - the resolved flag value, used only when the user supplied one of `versionFlags`
   * @param remoteConfigVersion - the component version recorded in remote config (0.0.0 when unknown)
   * @param fallbackDefault - the version.ts default to use when neither of the above is available
   */
  public static resolveFromFlags(
    configManager: ConfigManager,
    versionFlags: CommandFlag[],
    flagValue: string | undefined,
    remoteConfigVersion: SemanticVersion<string> | undefined | null,
    fallbackDefault: string,
  ): string {
    const wasSuppliedByUser: boolean = versionFlags.some((flag: CommandFlag): boolean =>
      configManager.wasFlagProvidedByUser(flag),
    );

    return this.resolve(wasSuppliedByUser ? flagValue : undefined, remoteConfigVersion, fallbackDefault);
  }
}
