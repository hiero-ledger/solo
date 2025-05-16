// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../schema/migration/api/schema-definition.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {LayeredEnvironmentModelConfigSource} from './layered-environment-model-config-source.js';

export abstract class EnvironmentModelConfigSource<T extends object> extends LayeredEnvironmentModelConfigSource<T> {
  protected constructor(
    schema: SchemaDefinition<T>,
    backend: EnvironmentStorageBackend,
    mapper: ObjectMapper,
    prefix?: string,
  ) {
    super(schema, backend, mapper, prefix);
  }
}
