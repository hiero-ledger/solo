// SPDX-License-Identifier: Apache-2.0

import {MutableModelConfigSource} from './mutable-model-config-source.js';
import {type RemoteConfigSchema} from '../../schema/model/remote/remote-config-schema.js';
import {type Refreshable} from '../spi/refreshable.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type ObjectStorageBackend} from '../../backend/api/object-storage-backend.js';
import {type RemoteConfigSchemaDefinition} from '../../schema/migration/impl/remote/remote-config-schema-definition.js';

export class RemoteConfigSource extends MutableModelConfigSource<RemoteConfigSchema> implements Refreshable {
  public constructor(schema: RemoteConfigSchemaDefinition, mapper: ObjectMapper, backend: ObjectStorageBackend) {
    super('remote-config-data', schema, backend, mapper);
  }

  public get name(): string {
    return this.constructor.name;
  }

  public get ordinal(): number {
    return 300;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }
}
