// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from '../types/deprecation.js';
import {type Version} from '../types/index.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';

/**
 * Pure helpers for reasoning about {@link Deprecation} metadata: computing removal targets and formatting
 * the consistent user-facing warning and help/docs markers.
 */
export class Deprecations {
  /** Default number of minor versions a feature is kept after deprecation before it should be removed. */
  public static readonly DEFAULT_REMOVAL_WINDOW: number = 6;

  /**
   * Computes the removal target version by advancing {@link since} forward by {@link window} minor versions.
   * Solo is on the `0.x` line, so the removal window is measured in minor bumps (e.g. `0.84.0` + 6 = `0.90.0`).
   */
  public static computeRemoveBy(since: Version, window: number = Deprecations.DEFAULT_REMOVAL_WINDOW): Version {
    let version: SemanticVersion<string> = new SemanticVersion<string>(since);
    for (let index: number = 0; index < window; index += 1) {
      version = version.bumpMinor();
    }
    return version.toString();
  }

  /** Returns the explicit {@link Deprecation.removeBy} when set, otherwise the auto-computed removal target. */
  public static resolveRemoveBy(deprecation: Deprecation): Version {
    return deprecation.removeBy ?? Deprecations.computeRemoveBy(deprecation.since);
  }

  /**
   * Builds the canonical warning shown to the user whenever a deprecated feature is used.
   * @param feature - the deprecated feature's identifier, e.g. `--relay-release`
   * @param deprecation - the structured deprecation metadata
   */
  public static formatDeprecationMessage(feature: string, deprecation: Deprecation): string {
    const removeBy: Version = Deprecations.resolveRemoveBy(deprecation);
    const parts: string[] = [
      `'${feature}' is deprecated since v${deprecation.since} and will be removed in v${removeBy}.`,
    ];
    if (deprecation.replacement) {
      parts.push(`Use '${deprecation.replacement}' instead.`);
    }
    if (deprecation.reason) {
      parts.push(deprecation.reason);
    }
    parts.push(`(tracking issue: #${deprecation.removalIssue})`);
    return parts.join(' ');
  }

  /**
   * Builds the compact marker embedded in help text and generated documentation. It is intentionally short
   * because it is appended to a flag/command description; the leading "deprecated" word is supplied by the
   * surrounding context (yargs' `[deprecated: ...]` for flags, `[DEPRECATED: ...]` for commands).
   */
  public static formatHelpMarker(deprecation: Deprecation): string {
    const removeBy: Version = Deprecations.resolveRemoveBy(deprecation);
    const replacement: string = deprecation.replacement ? `, use ${deprecation.replacement}` : '';
    return `since v${deprecation.since}, removal v${removeBy}${replacement}`;
  }
}
