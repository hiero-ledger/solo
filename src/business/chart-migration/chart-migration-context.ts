// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type SemanticVersion} from '../utils/semantic-version.js';

/**
 * What a {@link ChartMigration} sees of the release being upgraded, and how it feeds values into the `helm upgrade`.
 *
 * Contributed values are passed to Helm before every other values argument, so the values Solo computes for the
 * upgrade and the values files the user supplies both override them. The order, from lowest to highest precedence:
 * carried release values, inherited values (in the order they were added), Solo-supplied values, user-supplied values.
 */
export interface ChartMigrationContext {
  readonly namespace: NamespaceName;
  readonly releaseName: string;
  readonly chartName: string;
  readonly kubeContext: string;

  /** The chart version of the deployed release. */
  readonly currentVersion: SemanticVersion<string>;

  /** The chart version the release is being upgraded to. */
  readonly targetVersion: SemanticVersion<string>;

  /**
   * The user-supplied values of the deployed release (`helm get values`), as carried so far: once an earlier
   * migration in the same upgrade has called {@link carryReleaseValues}, this returns the values it carried, so
   * migrations across several boundaries rewrite the values in turn. The release is read once per upgrade.
   *
   * @returns a copy the caller may modify
   * @throws HelmReleaseValuesReadFailedSoloError when the release values cannot be read
   */
  releaseValues(): Promise<Record<string, unknown>>;

  /**
   * Carries the deployed release's values into the upgraded release, as rewritten for the new chart. Replaces the
   * values an earlier migration carried; start from {@link releaseValues} to build on them. Carrying values replaces
   * `--reuse-values`, which would merge the original, un-migrated values back in, so the upgrade runs without it.
   *
   * @param values - the complete set of release values to carry
   */
  carryReleaseValues(values: Record<string, unknown>): void;

  /**
   * Adds values the old release implied but the new chart no longer generates, typically derived from cluster state.
   * Unlike {@link carryReleaseValues}, this keeps `--reuse-values` when the caller asked for it: the values are layered
   * on top of the reused ones. Values added later override values added earlier.
   *
   * @param values - the values to add
   */
  addInheritedValues(values: Record<string, unknown>): void;
}
