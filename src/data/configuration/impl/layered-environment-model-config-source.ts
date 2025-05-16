// SPDX-License-Identifier: Apache-2.0

import {LayeredConfigSource} from './layered-config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type SchemaDefinition} from '../../schema/migration/api/schema-definition.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {type ModelConfigSource} from '../spi/model-config-source.js';
import {type EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';

export abstract class LayeredEnvironmentModelConfigSource<T extends object>
  extends LayeredConfigSource
  implements ModelConfigSource<T>
{
  private _modelData: T;

  public get modelData(): T {
    return this._modelData;
  }

  protected set modelData(value: T) {
    this._modelData = value;
  }

  protected constructor(
    public readonly schema: SchemaDefinition<T>,
    backend: EnvironmentStorageBackend,
    mapper: ObjectMapper,
    prefix?: string,
  ) {
    super(backend, mapper, prefix);

    if (!ReflectAssist.isEnvironmentStorageBackend(this.backend)) {
      throw new IllegalArgumentError('backend must be an environment storage backend');
    }

    if (!schema) {
      throw new IllegalArgumentError('schema must not be null or undefined');
    }

    if (!mapper) {
      throw new IllegalArgumentError('mapper must not be null or undefined');
    }
  }

  public async load(): Promise<void> {
    if (!ReflectAssist.isEnvironmentStorageBackend(this.backend)) {
      throw new ConfigurationError('backend must be an environment storage backend');
    }

    this.forest = null;
    const value: object = await this.backend.list();
    this.modelData = await this.schema.transform(value);
    this.forest = Forest.from(this.mapper.toFlatKeyMap(this.modelData));
  }
}
