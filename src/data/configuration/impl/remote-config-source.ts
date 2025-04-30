// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfig} from '../../schema/model/remote/remote-config.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type Refreshable} from '../spi/refreshable.js';
import {type ObjectStorageBackend} from '../../backend/api/object-storage-backend.js';
import {MutableModelConfigSource} from './mutable-model-config-source.js';
import {type RemoteConfigSchema} from '../../schema/migration/impl/remte/remote-config-schema.js';

export class RemoteConfigSource extends MutableModelConfigSource<RemoteConfig> implements Refreshable {
  public constructor(
    fileName: string,
    schema: RemoteConfigSchema,
    mapper: ObjectMapper,
    backend: ObjectStorageBackend,
  ) {
    super(fileName, schema, backend, mapper);
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
