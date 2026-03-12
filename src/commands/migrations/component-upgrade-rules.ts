// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {SemVer, gte, lt} from 'semver';
import * as constants from '../../core/constants.js';

export type ComponentUpgradeMigrationStrategy = 'in-place' | 'recreate';

export interface ComponentUpgradeBoundaryRule {
  version: string;
  strategy: ComponentUpgradeMigrationStrategy;
  reason: string;
  extraCommandArgs?: string[];
}

export interface ComponentUpgradeMigrationConfig {
  defaultStrategy: ComponentUpgradeMigrationStrategy;
  defaultExtraCommandArgs?: string[];
  boundaries: ComponentUpgradeBoundaryRule[];
}

export interface ComponentUpgradeMigrationConfigFile {
  components: Record<string, ComponentUpgradeMigrationConfig>;
}

export interface ComponentUpgradeMigrationStep {
  fromVersion: string;
  toVersion: string;
  strategy: ComponentUpgradeMigrationStrategy;
  reason: string;
  extraCommandArgs: string[];
}

const DEFAULT_COMPONENT_UPGRADE_MIGRATION_CONFIG: ComponentUpgradeMigrationConfigFile = {
  components: {
    'block-node': {
      defaultStrategy: 'in-place',
      boundaries: [
        {
          version: '0.28.0',
          strategy: 'recreate',
          reason: 'StatefulSet immutable field change across 0.28.0 boundary',
        },
      ],
    },
  },
};

let cachedConfig: ComponentUpgradeMigrationConfigFile | undefined;

/** Resets the cached migration config. Intended for use in tests only. */
export function resetUpgradeMigrationConfigCache(): void {
  cachedConfig = undefined;
}

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

function normalizeVersion(version: string): string {
  return new SemVer(version).version;
}

function findCrossedBoundaries(
  componentConfig: ComponentUpgradeMigrationConfig,
  current: SemVer,
  target: SemVer,
): ComponentUpgradeBoundaryRule[] {
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
    // eslint-disable-next-line unicorn/no-array-sort
    .sort((a, b): number => new SemVer(a.version).compare(new SemVer(b.version)));

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

export function planComponentUpgradeMigrationPath(
  component: string,
  currentVersion: string,
  targetVersion: string,
): ComponentUpgradeMigrationStep[] {
  const normalizedCurrentVersion: string = normalizeVersion(currentVersion);
  const normalizedTargetVersion: string = normalizeVersion(targetVersion);

  const current: SemVer = new SemVer(normalizedCurrentVersion);
  const target: SemVer = new SemVer(normalizedTargetVersion);
  const componentConfig: ComponentUpgradeMigrationConfig = getComponentConfig(component);
  const defaultExtraCommandArguments: string[] = componentConfig.defaultExtraCommandArgs || [];

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

  const boundaries: ComponentUpgradeBoundaryRule[] = findCrossedBoundaries(componentConfig, current, target);
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

  const steps: ComponentUpgradeMigrationStep[] = [];
  let cursor: SemVer = current;

  for (const [index, boundary] of boundaries.entries()) {
    const isLast: boolean = index === boundaries.length - 1;
    const stepTarget: SemVer = isLast ? target : new SemVer(boundary.version);
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
