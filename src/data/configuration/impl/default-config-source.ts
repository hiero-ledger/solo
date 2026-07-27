// SPDX-License-Identifier: Apache-2.0

import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {LayeredModelConfigSource} from './layered-model-config-source.js';
import {type SchemaDefinition} from '../../schema/migration/api/schema-definition.js';
import {YamlFileStorageBackend} from '../../backend/impl/yaml-file-storage-backend.js';
import {type Refreshable} from '../spi/refreshable.js';

/**
 * A {@link ConfigSource} that reads default configuration data from its YAML file backend.
 */
export class DefaultConfigSource<T extends object> extends LayeredModelConfigSource<T> implements Refreshable {
  private readonly data: Map<string, string>;

  public constructor(fileName: string, basePath: string, schema: SchemaDefinition<T>, mapper: ObjectMapper) {
    super(fileName, schema, new YamlFileStorageBackend(basePath), mapper);
    this.data = new Map<string, string>();
  }

  public get name(): string {
    return this.constructor.name;
  }

  public get ordinal(): number {
    return 0;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }
}
