// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {EnvironmentConfigV1Migration} from './environment-config-v1-migration.js';
import {EnvironmentConfigSchema} from '../../../model/environment/environment-config-schema.js';

@injectable()
export class EnvironmentConfigSchemaDefinition
  extends SchemaDefinitionBase<EnvironmentConfigSchema>
  implements SchemaDefinition<EnvironmentConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return EnvironmentConfigSchema.name;
  }

  public get version(): Version<number> {
    return EnvironmentConfigSchema.SCHEMA_VERSION;
  }

  public get classCtor(): ClassConstructor<EnvironmentConfigSchema> {
    return EnvironmentConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new EnvironmentConfigV1Migration()];
  }
}
