// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {LayeredConfigSource} from './layered-config-source.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {type Refreshable} from '../spi/refreshable.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {EnvironmentAliasRegistry} from '../../schema/decorators/environment-alias-registry.js';

/**
 * A {@link ConfigSource} that reads configuration data from the environment.
 *
 * <p>
 * Strings are read verbatim from the environment variables.
 * Numbers and booleans are converted from strings using the JSON parser.
 * Objects, arrays of objects, and arrays of primitives are assumed to be stored as serialized JSON strings.
 */
export class EnvironmentConfigSource extends LayeredConfigSource implements ConfigSource, Refreshable {
  /**
   * The data read from the environment.
   * @private
   */
  private readonly data: Map<string, string>;

  /** Typed reference to the backend for reading fixed/legacy env var aliases verbatim. */
  private readonly environmentBackend: EnvironmentStorageBackend;

  public constructor(mapper: ObjectMapper, prefix?: string) {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend(prefix);
    super(backend, mapper, prefix);
    this.environmentBackend = backend;
    this.data = new Map<string, string>();
  }

  public get name(): string {
    return 'EnvironmentConfigSource';
  }

  public get ordinal(): number {
    return 100;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }

  public async load(): Promise<void> {
    this.data.clear();
    this.forest = undefined;

    const variables: string[] = await this.backend.list();
    for (const k of variables) {
      try {
        const va: Buffer = await this.backend.readBytes(k);
        this.data.set(k, va.toString('utf8'));
      } catch (error) {
        throw new ConfigurationError(`Failed to read environment variable: ${k}`, error);
      }
    }

    this.applyAliases();

    this.forest = Forest.from(this.data);
  }

  /**
   * Applies fixed environment variable aliases, in descending precedence: the generated `SOLO_*` name,
   * then supported aliases, then legacy ones. An alias is used only when nothing higher has already set
   * its canonical key.
   */
  private applyAliases(): void {
    const aliases: [string, string][] = [...EnvironmentAliasRegistry.aliasMap()];

    // Ordered explicitly rather than relying on declaration order: property decorators evaluate bottom-up,
    // so a field's legacy alias would otherwise be registered before the supported one above it and win.
    const ordered: [string, string][] = [
      ...aliases.filter(([name]: [string, string]): boolean => !EnvironmentAliasRegistry.isLegacy(name)),
      ...aliases.filter(([name]: [string, string]): boolean => EnvironmentAliasRegistry.isLegacy(name)),
    ];

    const generatedKeys: Set<string> = new Set<string>(this.data.keys());

    for (const [name, canonicalKey] of ordered) {
      const value: string | undefined = this.environmentBackend.readRawValue(name);
      if (value === undefined) {
        continue;
      }

      // Aliases are a supported, documented spelling — routine use is not worth a warning. Only the
      // ambiguous case earns one: two spellings set at once, with the higher-precedence one silently
      // winning. Warning unconditionally would put a console.warn (which bypasses SoloLogger and
      // SOLO_SILENT_MODE) into every CI run, since CI sets ENABLE_IMAGE_CACHE and
      // DISABLE_IMPORTER_SPRING_PROFILES.
      if (this.data.has(canonicalKey)) {
        const winner: string = generatedKeys.has(canonicalKey) ? 'the generated name' : 'a higher-precedence alias';
        console.warn(
          `Environment variable '${name}' is ignored because ${winner} for config key ` +
            `'${canonicalKey}' is also set and takes precedence.`,
        );
        continue;
      }

      this.data.set(canonicalKey, value);
    }
  }
}
