// SPDX-License-Identifier: Apache-2.0

import {type LocalConfigSchema} from '../../schema/model/local/local-config-schema.js';
import {type LocalConfigSchemaDefinition} from '../../schema/migration/impl/local/local-config-schema-definition.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type Refreshable} from '../spi/refreshable.js';
import {type ObjectStorageBackend} from '../../backend/api/object-storage-backend.js';
import {MutableModelConfigSource} from './mutable-model-config-source.js';

export class LocalConfigSource extends MutableModelConfigSource<LocalConfigSchema> implements Refreshable {
  public constructor(
    fileName: string,
    schema: LocalConfigSchemaDefinition,
    mapper: ObjectMapper,
    backend: ObjectStorageBackend,
    modelTemplate?: LocalConfigSchema,
  ) {
    super(fileName, schema, backend, mapper);

    if (modelTemplate) {
      this.modelData = modelTemplate;
    }
  }

  public get name(): string {
    return this.constructor.name;
  }

  public get ordinal(): number {
    return 200;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }
}
