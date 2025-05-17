// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {LocalConfigSchema} from '../../../model/local/local-config-schema.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {LocalConfigV1Migration} from './local-config-v1-migration.js';
import {LocalConfigV2Migration} from './local-config-v2-migration.js';

@injectable()
export class LocalConfigSchemaDefinition
  extends SchemaDefinitionBase<LocalConfigSchema>
  implements SchemaDefinition<LocalConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return LocalConfigSchema.name;
  }

  public get version(): Version<number> {
    return LocalConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<LocalConfigSchema> {
    return LocalConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new LocalConfigV1Migration(), new LocalConfigV2Migration()];
  }
}
