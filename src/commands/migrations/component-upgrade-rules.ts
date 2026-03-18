// SPDX-License-Identifier: Apache-2.0

/**
 * # Component Upgrade Migration Rules
 *
 * ## Architecture Overview
 *
 * This module implements a **boundary-based upgrade migration planner** for Solo-managed Kubernetes
 * components (e.g., block-node). It determines the safest strategy for upgrading a component from
 * one version to another by analyzing which "boundary" versions are crossed during the upgrade.
 *
 * ### The Problem
 *
 * Some Kubernetes resources (like StatefulSets) have **immutable fields** that cannot be changed via
 * a simple `helm upgrade`. When a component's Helm chart introduces breaking changes to such fields
 * at a certain version, the existing StatefulSet must be deleted and recreated rather than upgraded
 * in-place. This module encodes knowledge of those breaking version boundaries and produces a
 * multi-step migration plan that the caller (e.g., `BlockNodeCommand`) can execute.
 *
 * ### Key Concepts
 *
 * - **Strategy**: Either `'in-place'` (Helm upgrade) or `'recreate'` (delete + reinstall).
 *   The `'in-place'` consumer also has a fallback: if `helm upgrade` fails with an immutable-field
 *   error, it automatically retries as `'recreate'`.
 *
 * - **Boundary**: A specific semver version at which the upgrade strategy changes. For example,
 *   if a future block-node release changes an immutable StatefulSet field, a boundary at that
 *   version with strategy `'recreate'` means: "any upgrade crossing this version requires recreation."
 *
 * - **Migration Plan**: An ordered list of `ComponentUpgradeMigrationStep` objects, each describing
 *   a segment of the upgrade path with its own strategy. For simple upgrades (no boundaries crossed),
 *   the plan is a single step. For complex upgrades that cross multiple boundaries with different
 *   strategies, the plan may have multiple steps.
 *
 * ### How the Planner Works (Algorithm)
 *
 * Given `currentVersion` → `targetVersion` for a component:
 *
 * 1. Load the component's migration config (boundaries + default strategy).
 * 2. Find all boundaries where `current < boundary.version <= target` (i.e., boundaries crossed
 *    during a forward upgrade).
 * 3. Sort crossed boundaries by version ascending.
 * 4. **Merge consecutive boundaries with the same strategy** — if boundaries at 1.0.0 and 2.0.0
 *    both require `'recreate'`, they collapse into one step that jumps straight to 2.0.0.
 * 5. Generate steps:
 *    - For each (reduced) boundary, create a step from the cursor to the boundary's version (or
 *      to the target version if it's the last boundary).
 *    - If the cursor hasn't reached the target after all boundaries, add a final step using
 *      the default strategy.
 *
 * ### Example
 *
 * **Current config** — `block-node` has a `'recreate'` boundary at `0.28.1`:
 *
 * - Upgrade 0.28.0 → 0.28.1: Boundary at 0.28.1 crossed → 1 step, `'recreate'` (delete + reinstall).
 * - Upgrade 0.28.0 → 0.35.0: Boundary at 0.28.1 crossed → 1 step, `'recreate'` (target used directly).
 * - Upgrade 0.28.1 → 0.35.0: Already past the boundary → 1 step, `'in-place'`.
 *
 * **Adding a future boundary** — if a future block-node release changes an immutable StatefulSet
 * field at v0.29.0, add an entry for it to the external override file at
 * `constants.UPGRADE_MIGRATIONS_FILE`:
 *
 * ```json
 * {
 *   "components": {
 *     "block-node": {
 *       "defaultStrategy": "in-place",
 *       "boundaries": [
 *         {
 *           "version": "0.28.1",
 *           "strategy": "recreate",
 *           "reason": "The 0.28.1 chart introduced blockNode.persistence.plugins; --reuse-values from 0.28.0 fails"
 *         },
 *         {
 *           "version": "0.29.0",
 *           "strategy": "recreate",
 *           "reason": "StatefulSet volumeClaimTemplates changed at 0.29.0; requires full recreate"
 *         }
 *       ]
 *     }
 *   }
 * }
 * ```
 *
 * With that second boundary added:
 *
 * - Upgrade 0.28.0 → 0.29.0: Both boundaries have `'recreate'` → merged into 1 step targeting 0.29.0.
 * - Upgrade 0.28.1 → 0.29.0: Only 0.29.0 boundary crossed → 1 step, `'recreate'`.
 * - Upgrade 0.29.0 → 0.30.5: No boundary crossed → 1 step, `'in-place'`.
 *
 * ### Configuration Loading
 *
 * The planner first tries to load an external JSON file at `constants.UPGRADE_MIGRATIONS_FILE`.
 * If it exists and parses correctly, it overrides the embedded defaults. If not found or on parse
 * error, the embedded `DEFAULT_COMPONENT_UPGRADE_MIGRATION_CONFIG` is used. Configuration is
 * cached after the first load for performance.
 *
 * ### Consumer
 *
 * Currently consumed by `BlockNodeCommand` in `block-node.ts`:
 * - The "Plan block node upgrade migration" task calls `planComponentUpgradeMigrationPath()`.
 * - The "Update block node chart" task iterates over the returned steps and executes each one:
 *   - `'recreate'` → uninstall chart, wait for pod termination, reinstall.
 *   - `'in-place'` → `helm upgrade`, with automatic fallback to `'recreate'` on failure.
 *
 * The architecture is generic (keyed by component name) so new components can be added
 * by extending the config without code changes.
 */

import fs from 'node:fs';
import {SemVer, gte, lt} from 'semver';
import * as constants from '../../core/constants.js';

/**
 * The two possible upgrade strategies:
 * - `'in-place'`: Perform a standard Helm upgrade. The existing pods are updated in-place.
 *   Fast and non-destructive, but fails if the chart introduces immutable field changes.
 * - `'recreate'`: Delete the existing Helm release and reinstall from scratch. Required when
 *   Kubernetes immutable fields (e.g., StatefulSet volumeClaimTemplates, selector) have changed.
 *   More disruptive but guaranteed to work across any chart change.
 */
export type ComponentUpgradeMigrationStrategy = 'in-place' | 'recreate';

/**
 * A single boundary rule that defines a version threshold where the upgrade strategy changes.
 *
 * When an upgrade crosses this version (i.e., `currentVersion < version <= targetVersion`),
 * the specified strategy is applied for that segment of the upgrade path.
 *
 * @property version - The semver version string representing the boundary (e.g., '0.28.0').
 *   Any upgrade that moves from below this version to at-or-above it triggers this rule.
 * @property strategy - The upgrade strategy required when crossing this boundary.
 * @property reason - A human-readable explanation of why this boundary exists (e.g., which
 *   immutable field changed). Shown in task output for operator visibility.
 * @property extraCommandArgs - Optional additional Helm CLI arguments to pass during this
 *   migration step (e.g., extra `--set` values needed for the transition).
 */
export interface ComponentUpgradeBoundaryRule {
  version: string;
  strategy: ComponentUpgradeMigrationStrategy;
  reason: string;
  extraCommandArgs?: string[];
}

/**
 * Per-component migration configuration containing the default strategy and all known
 * version boundaries.
 *
 * @property defaultStrategy - The strategy used when no boundaries are crossed (or for
 *   the final segment after the last boundary). Typically `'in-place'`.
 * @property defaultExtraCommandArgs - Extra Helm CLI arguments applied to all steps that
 *   use the default strategy.
 * @property boundaries - Ordered list of version boundaries. Each one marks a version
 *   that may require a different strategy when crossed.
 */
export interface ComponentUpgradeMigrationConfig {
  defaultStrategy: ComponentUpgradeMigrationStrategy;
  defaultExtraCommandArgs?: string[];
  boundaries: ComponentUpgradeBoundaryRule[];
}

/**
 * Top-level config file structure. Maps component names (e.g., 'block-node') to their
 * individual migration configs. This is the shape of both the embedded default config
 * and the optional external JSON override file.
 */
export interface ComponentUpgradeMigrationConfigFile {
  components: Record<string, ComponentUpgradeMigrationConfig>;
}

/**
 * A single step in the computed migration plan. The planner returns an ordered array of
 * these steps, each representing one segment of the upgrade path.
 *
 * The caller executes these steps sequentially:
 * - For `'recreate'`: uninstall the chart, wait for pod cleanup, reinstall at `toVersion`.
 * - For `'in-place'`: run `helm upgrade` to `toVersion`.
 *
 * @property fromVersion - The starting version for this step (normalized semver).
 * @property toVersion - The target version for this step (normalized semver).
 * @property strategy - How to perform this particular upgrade segment.
 * @property reason - Human-readable explanation of why this strategy was chosen.
 * @property extraCommandArgs - Additional Helm CLI arguments for this step.
 */
export interface ComponentUpgradeMigrationStep {
  fromVersion: string;
  toVersion: string;
  strategy: ComponentUpgradeMigrationStrategy;
  reason: string;
  extraCommandArgs: string[];
}

/**
 * Embedded default migration configuration. Used when no external override file is found.
 *
 * Currently defines rules for the `block-node` component:
 * - Default strategy: `'in-place'` (standard Helm upgrade).
 * - Boundary at `0.28.1` (`'recreate'`): The 0.28.1 Helm chart introduced a new
 *   `blockNode.persistence.plugins` value path. A plain `helm upgrade --reuse-values` from
 *   0.28.0 fails with a nil pointer error because the old values don't contain that path.
 *   The StatefulSet must be deleted and recreated with fresh values.
 *
 * Note: there is no supported upgrade path from v0.26.x directly to v0.28.x — the block stream
 * format changed incompatibly between those versions. v0.28.0 must be deployed fresh.
 *
 * To add a new component, add a new key under `components` with its own `defaultStrategy`
 * and `boundaries` array. No code changes are needed — the planner is fully data-driven.
 */
const DEFAULT_COMPONENT_UPGRADE_MIGRATION_CONFIG: ComponentUpgradeMigrationConfigFile = {
  components: {
    'block-node': {
      defaultStrategy: 'in-place',
      boundaries: [
        {
          version: '0.28.1',
          strategy: 'recreate',
          reason:
            'The 0.28.1 chart introduced blockNode.persistence.plugins; --reuse-values from 0.28.0 fails with a nil pointer error. StatefulSet must be recreated with fresh values.',
        },
      ],
    },
  },
};

/**
 * Module-level cache for the loaded migration config. Once loaded (from file or embedded
 * defaults), the config is stored here to avoid redundant file I/O on subsequent calls.
 * Reset via `resetUpgradeMigrationConfigCache()` in tests.
 */
let cachedConfig: ComponentUpgradeMigrationConfigFile | undefined;

/**
 * Resets the cached migration config. Intended for use in tests only.
 *
 * This allows tests to:
 * - Switch between different config files between test cases.
 * - Force re-loading to verify file parsing behavior.
 * - Ensure test isolation (no state leaks between test cases).
 */
export function resetUpgradeMigrationConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * Loads the component upgrade migration configuration.
 *
 * Loading priority:
 * 1. Return cached config if already loaded (performance optimization).
 * 2. Try to read and parse the external JSON override file at `constants.UPGRADE_MIGRATIONS_FILE`.
 *    This allows operators to customize migration rules without modifying source code.
 * 3. If the file doesn't exist or fails to parse, silently fall back to the embedded
 *    `DEFAULT_COMPONENT_UPGRADE_MIGRATION_CONFIG`.
 *
 * The fallback behavior is intentional: we never want a missing or malformed config file to
 * block upgrades entirely. The embedded defaults always provide a safe baseline.
 */
function loadUpgradeMigrationConfig(): ComponentUpgradeMigrationConfigFile {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (fs.existsSync(constants.UPGRADE_MIGRATIONS_FILE)) {
      const fileContent: string = fs.readFileSync(constants.UPGRADE_MIGRATIONS_FILE, 'utf8');
      const parsed: ComponentUpgradeMigrationConfigFile = JSON.parse(fileContent);

      if (!parsed.components || typeof parsed.components !== 'object') {
        throw new Error('Missing required migration field: components');
      }

      cachedConfig = parsed;
      return cachedConfig;
    }
  } catch {
    // ignore and fallback to default embedded rules
  }

  cachedConfig = DEFAULT_COMPONENT_UPGRADE_MIGRATION_CONFIG;
  return cachedConfig;
}

/**
 * Retrieves the migration config for a specific component by name.
 *
 * If the component has no entry in the config (e.g., a newly added component that hasn't
 * had any migration rules defined yet), returns a safe default: `'in-place'` strategy with
 * no boundaries. This means unknown components always get a simple Helm upgrade.
 *
 * @param component - The component name (e.g., 'block-node').
 * @returns The component's migration config, or a default no-op config.
 */
function getComponentConfig(component: string): ComponentUpgradeMigrationConfig {
  const config: ComponentUpgradeMigrationConfigFile = loadUpgradeMigrationConfig();
  const componentConfig: ComponentUpgradeMigrationConfig | undefined = config.components[component];
  if (componentConfig) {
    return componentConfig;
  }

  return {
    defaultStrategy: 'in-place',
    boundaries: [],
  };
}

/**
 * Normalizes a version string to a canonical semver form.
 * Strips leading 'v' prefixes, pre-release tags, and build metadata inconsistencies
 * so that comparisons are consistent. For example, 'v0.28.0' → '0.28.0'.
 */
function normalizeVersion(version: string): string {
  return new SemVer(version).version;
}

/**
 * Finds all boundary rules that are "crossed" during a forward upgrade from `current` to `target`.
 *
 * A boundary is "crossed" when:
 *   current < boundary.version <= target
 *
 * This means:
 * - If you're already AT or ABOVE the boundary version, it's not crossed (you've already
 *   passed it in a previous upgrade).
 * - If the target is BELOW the boundary version, it's not crossed (you haven't reached it yet).
 *
 * After finding crossed boundaries, they are:
 * 1. Sorted ascending by version (so the earliest boundary is processed first).
 * 2. **Reduced (merged)**: consecutive boundaries with the SAME strategy are collapsed into
 *    one entry (keeping the later version). This optimization avoids unnecessary intermediate
 *    steps. For example, if boundaries at 0.28.0 and 0.30.0 both require `'recreate'`, there's
 *    no point recreating at 0.28.0 and then recreating again at 0.30.0 — we can skip straight
 *    to 0.30.0 with a single recreate.
 *
 * @param componentConfig - The component's migration config containing boundary rules.
 * @param current - The current installed version (parsed SemVer).
 * @param target - The desired target version (parsed SemVer).
 * @returns Sorted and reduced array of crossed boundary rules.
 */
function findCrossedBoundaries(
  componentConfig: ComponentUpgradeMigrationConfig,
  current: SemVer,
  target: SemVer,
): ComponentUpgradeBoundaryRule[] {
  // Step 1: Normalize all boundary versions and filter to those crossed during this upgrade.
  // A boundary is crossed when: currentVersion < boundaryVersion AND targetVersion >= boundaryVersion.
  const crossed: ComponentUpgradeBoundaryRule[] = componentConfig.boundaries
    .map(
      (boundary): ComponentUpgradeBoundaryRule => ({
        ...boundary,
        version: normalizeVersion(boundary.version),
      }),
    )
    .filter(
      (boundary): boolean => lt(current, new SemVer(boundary.version)) && gte(target, new SemVer(boundary.version)),
    )
    // Step 2: Sort crossed boundaries by version ascending so we process them in order.
    // eslint-disable-next-line unicorn/no-array-sort
    .sort((a, b): number => new SemVer(a.version).compare(new SemVer(b.version)));

  // Step 3: Reduce (merge) consecutive boundaries with the same strategy.
  // This avoids redundant intermediate steps. For example, if we have:
  //   [{ version: '1.0.0', strategy: 'recreate' }, { version: '2.0.0', strategy: 'recreate' }]
  // We collapse them into just [{ version: '2.0.0', strategy: 'recreate' }] because there's
  // no value in recreating at 1.0.0 only to recreate again at 2.0.0.
  // However, if strategies differ (e.g., 'recreate' then 'in-place'), both are kept since
  // they represent genuinely different upgrade behavior.
  const reduced: ComponentUpgradeBoundaryRule[] = [];
  for (const boundary of crossed) {
    const last: ComponentUpgradeBoundaryRule | undefined = reduced.at(-1);
    if (last && last.strategy === boundary.strategy) {
      reduced[reduced.length - 1] = boundary;
    } else {
      reduced.push(boundary);
    }
  }

  return reduced;
}

/**
 * Plans the complete upgrade migration path for a component.
 *
 * This is the main entry point of the module. Given a component name, current version, and
 * target version, it returns an ordered list of migration steps that the caller should
 * execute sequentially to safely upgrade the component.
 *
 * ## Behavior by scenario
 *
 * ### Downgrade or same-version (current >= target)
 * Returns a single step using the component's default strategy. No boundary analysis is
 * performed since boundaries only apply to forward upgrades.
 *
 * ### Forward upgrade with no boundaries crossed
 * Returns a single step using the default strategy (typically `'in-place'`).
 *
 * ### Forward upgrade crossing one or more boundaries
 * Returns multiple steps, one per boundary group (after merging consecutive same-strategy
 * boundaries). The last boundary's step targets the final `targetVersion` (not the boundary
 * version itself). If there's remaining distance after all boundaries, a final default-
 * strategy step covers the gap.
 *
 * ## Example migration plans
 *
 * **Current config** — default `'in-place'`, `'recreate'` boundary at `0.28.1`:
 *
 * ```
 * planComponentUpgradeMigrationPath('block-node', '0.28.0', '0.28.1')
 * → [{ from: '0.28.0', to: '0.28.1', strategy: 'recreate' }]
 * // Boundary at 0.28.1 crossed; step targets the final version directly.
 *
 * planComponentUpgradeMigrationPath('block-node', '0.28.0', '0.35.0')
 * → [{ from: '0.28.0', to: '0.35.0', strategy: 'recreate' }]
 * // Boundary at 0.28.1 crossed; last boundary so step jumps to target (0.35.0).
 *
 * planComponentUpgradeMigrationPath('block-node', '0.28.1', '0.35.0')
 * → [{ from: '0.28.1', to: '0.35.0', strategy: 'in-place' }]
 * // Already at/past 0.28.1; no boundary crossed → default in-place.
 * ```
 *
 * **Hypothetical addition** — adding a second `'recreate'` boundary at 0.29.0:
 *
 * ```
 * // Config: boundaries: [{ version: '0.28.1', recreate }, { version: '0.29.0', recreate }]
 *
 * planComponentUpgradeMigrationPath('block-node', '0.28.0', '0.29.0')
 * → [{ from: '0.28.0', to: '0.29.0', strategy: 'recreate' }]
 * // Both boundaries have 'recreate' → merged into 1 step; last boundary targets final version.
 *
 * planComponentUpgradeMigrationPath('block-node', '0.28.1', '0.29.0')
 * → [{ from: '0.28.1', to: '0.29.0', strategy: 'recreate' }]
 * // Only the 0.29.0 boundary crossed → 1 recreate step.
 * ```
 *
 * @param component - Component name (e.g., 'block-node'). Must match a key in the config.
 * @param currentVersion - The currently installed version (semver string).
 * @param targetVersion - The desired target version (semver string).
 * @returns Ordered array of migration steps to execute.
 */
export function planComponentUpgradeMigrationPath(
  component: string,
  currentVersion: string,
  targetVersion: string,
): ComponentUpgradeMigrationStep[] {
  // Normalize version strings to canonical semver (strips 'v' prefix, etc.)
  const normalizedCurrentVersion: string = normalizeVersion(currentVersion);
  const normalizedTargetVersion: string = normalizeVersion(targetVersion);

  const current: SemVer = new SemVer(normalizedCurrentVersion);
  const target: SemVer = new SemVer(normalizedTargetVersion);
  const componentConfig: ComponentUpgradeMigrationConfig = getComponentConfig(component);
  const defaultExtraCommandArguments: string[] = componentConfig.defaultExtraCommandArgs || [];

  // Case 1: Downgrade or same-version — no boundary analysis needed.
  // Just return the default strategy. The caller may still perform the operation
  // (e.g., for re-applying config), but no special migration handling is required.
  if (!lt(current, target)) {
    return [
      {
        fromVersion: normalizedCurrentVersion,
        toVersion: normalizedTargetVersion,
        strategy: componentConfig.defaultStrategy,
        reason: 'No forward upgrade boundary crossing detected',
        extraCommandArgs: defaultExtraCommandArguments,
      },
    ];
  }

  // Case 2: Forward upgrade — find which boundaries are crossed.
  const boundaries: ComponentUpgradeBoundaryRule[] = findCrossedBoundaries(componentConfig, current, target);

  // Case 2a: No boundaries crossed — simple upgrade using the default strategy.
  if (boundaries.length === 0) {
    return [
      {
        fromVersion: normalizedCurrentVersion,
        toVersion: normalizedTargetVersion,
        strategy: componentConfig.defaultStrategy,
        reason: 'Default in-place upgrade path',
        extraCommandArgs: defaultExtraCommandArguments,
      },
    ];
  }

  // Case 2b: One or more boundaries are crossed — build a multi-step migration plan.
  // Walk through the reduced boundaries in order, creating a step for each one.
  // The `cursor` tracks where we are in the version progression.
  const steps: ComponentUpgradeMigrationStep[] = [];
  let cursor: SemVer = current;

  for (const [index, boundary] of boundaries.entries()) {
    const isLast: boolean = index === boundaries.length - 1;

    // For the last boundary, the step targets the final desired version (not the boundary
    // version itself). This avoids an unnecessary extra step from the last boundary to
    // the target version. For non-last boundaries, we step up to the boundary version.
    const stepTarget: SemVer = isLast ? target : new SemVer(boundary.version);

    // Skip if the cursor has already reached or passed this step's target.
    // This can happen when boundaries are close together or when the current version
    // is already at a boundary version.
    if (!lt(cursor, stepTarget)) {
      continue;
    }

    steps.push({
      fromVersion: cursor.version,
      toVersion: stepTarget.version,
      strategy: boundary.strategy,
      reason: boundary.reason,
      extraCommandArgs: boundary.extraCommandArgs || [],
    });
    cursor = stepTarget;
  }

  // If after processing all boundaries we still haven't reached the target version,
  // append a final step using the default strategy to cover the remaining distance.
  // This happens when the last boundary's version is before the target, AND the last
  // boundary wasn't the "isLast" boundary (which would have used the target directly).
  if (lt(cursor, target)) {
    steps.push({
      fromVersion: cursor.version,
      toVersion: target.version,
      strategy: componentConfig.defaultStrategy,
      reason: 'Default in-place upgrade path',
      extraCommandArgs: defaultExtraCommandArguments,
    });
  }

  return steps;
}
