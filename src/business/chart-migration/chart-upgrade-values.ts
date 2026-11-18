// SPDX-License-Identifier: Apache-2.0

/** The values a `helm upgrade` runs with once the applicable chart migrations have contributed theirs. */
export interface ChartUpgradeValues {
  /** The `--values`/`--set` arguments: the migrations' values files first, then the caller's arguments. */
  readonly valueArguments: string[];

  /** Whether to pass `--reuse-values`; false when a migration carried the release values instead. */
  readonly reuseValues: boolean;
}
