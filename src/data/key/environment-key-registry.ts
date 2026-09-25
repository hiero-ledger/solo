// SPDX-License-Identifier: Apache-2.0

import {ConfigurationError} from '../configuration/api/configuration-error.js';
import {EnvironmentAliasRegistry} from '../schema/decorators/environment-alias-registry.js';
import {EnvironmentKeyFormatter} from './environment-key-formatter.js';

/**
 * Resolves an environment variable name back to the config key it overrides.
 *
 * <p>Names use `_` for both nesting levels and camelCase word boundaries, so a name is ambiguous on its own
 * — `HELM_CHART_DIRECTORY` could be `helmChart.directory` or `helm.chart.directory`. The mapping is
 * therefore built by formatting every leaf path the schema declares and inverting the result. Two paths
 * formatting to the same name are a schema defect and fail fast rather than silently resolving to whichever
 * was walked last.
 */
export class EnvironmentKeyRegistry {
  /** Memoized `environment variable name` (unprefixed) -> `dotted config key path`. */
  private static cachedKeyMap: Map<string, string> | undefined;

  /** The config paths {@link cachedKeyMap} was built from; a new Set means the schemas changed. */
  private static cachedPaths: ReadonlySet<string> | undefined;

  private constructor() {}

  /**
   * Returns the environment variable name -> config key map, rebuilding it when the registered root schemas
   * have changed.
   * @throws ConfigurationError if two config keys format to the same environment variable name.
   */
  public static keyMap(): ReadonlyMap<string, string> {
    const paths: ReadonlySet<string> = EnvironmentAliasRegistry.configPaths();
    if (EnvironmentKeyRegistry.cachedKeyMap && EnvironmentKeyRegistry.cachedPaths === paths) {
      return EnvironmentKeyRegistry.cachedKeyMap;
    }

    const result: Map<string, string> = new Map<string, string>();
    for (const path of paths) {
      const name: string = EnvironmentKeyFormatter.instance().normalize(path);
      const existing: string | undefined = result.get(name);
      if (existing !== undefined) {
        throw new ConfigurationError(
          `Config keys '${existing}' and '${path}' both map to the environment variable name '${name}'; ` +
            'rename one of the schema fields so each key has a distinct environment variable name.',
        );
      }
      result.set(name, path);
    }

    EnvironmentKeyRegistry.cachedKeyMap = result;
    EnvironmentKeyRegistry.cachedPaths = paths;
    return result;
  }

  /** Returns the config key the name overrides, or undefined when no registered schema declares it. */
  public static resolve(environmentName: string): string | undefined {
    return EnvironmentKeyRegistry.keyMap().get(environmentName);
  }
}
