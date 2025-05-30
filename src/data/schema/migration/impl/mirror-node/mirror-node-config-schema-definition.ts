// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {MirrorNodeConfigV1Migration} from './mirror-node-config-v1-migration.js';
import {MirrorNodeConfigSchema} from '../../../model/mirror-node/mirror-node-config-schema.js';

@injectable()
export class MirrorNodeConfigSchemaDefinition
  extends SchemaDefinitionBase<MirrorNodeConfigSchema>
  implements SchemaDefinition<MirrorNodeConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return MirrorNodeConfigSchema.name;
  }

  public get version(): Version<number> {
    return MirrorNodeConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<MirrorNodeConfigSchema> {
    return MirrorNodeConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new MirrorNodeConfigV1Migration()];
  }
}
