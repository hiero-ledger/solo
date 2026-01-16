// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {type SchemaDefinition} from '../../api/schema-definition.js';
import {RemoteConfigSchema} from '../../../model/remote/remote-config-schema.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {RemoteConfigV1Migration} from './remote-config-v1-migration.js';
import {RemoteConfigV2Migration} from './remote-config-v2-migration.js';
import {RemoteConfigV3Migration} from './remote-config-v3-migration.js';
import {RemoteConfigV4Migration} from './remote-config-v4-migration.js';

@injectable()
export class RemoteConfigSchemaDefinition
  extends SchemaDefinitionBase<RemoteConfigSchema>
  implements SchemaDefinition<RemoteConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return RemoteConfigSchema.name;
  }

  public get version(): Version<number> {
    return RemoteConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<RemoteConfigSchema> {
    return RemoteConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [
      new RemoteConfigV1Migration(),
      new RemoteConfigV2Migration(),
      new RemoteConfigV3Migration(),
      new RemoteConfigV4Migration(),
    ];
  }
}
