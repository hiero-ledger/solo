// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {type Refreshable} from '../spi/refreshable.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {type EnvironmentConfigSchema} from '../../schema/model/environment/environment-config-schema.js';
import {LayeredEnvironmentModelConfigSource} from './layered-environment-model-config-source.js';
import {EnvironmentConfigSchemaDefinition} from '../../schema/migration/impl/environment/environment-config-schema-definition.js';

/**
 * A {@link ConfigSource} that reads configuration data from the environment.
 *
 * <p>
 * Strings are read verbatim from the environment variables.
 * Numbers and booleans are converted from strings using the JSON parser.
 * Objects, arrays of objects, and arrays of primitives are assumed to be stored as serialized JSON strings.
 */
export class EnvironmentConfigSource
  extends LayeredEnvironmentModelConfigSource<EnvironmentConfigSchema>
  implements ConfigSource, Refreshable
{
  /**
   * The data read from the environment.
   * @private
   */
  private readonly data: Map<string, string>;

  public constructor(mapper: ObjectMapper, prefix?: string) {
    super(new EnvironmentConfigSchemaDefinition(mapper), new EnvironmentStorageBackend(prefix), mapper, prefix);
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

  public override async load(): Promise<void> {
    this.data.clear();
    this.forest = null;

    const variables: string[] = await this.backend.list();
    for (const k of variables) {
      try {
        const va: Buffer = await this.backend.readBytes(k);
        this.data.set(k, va.toString('utf-8'));
      } catch (error) {
        throw new ConfigurationError(`Failed to read environment variable: ${k}`, error);
      }
    }

    this.forest = Forest.from(this.data);
  }
}
