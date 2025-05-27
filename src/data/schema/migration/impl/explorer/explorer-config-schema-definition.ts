// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {ExplorerConfigV1Migration} from './explorer-config-v1-migration.js';
import {ExplorerConfigSchema} from '../../../model/explorer/explorer-config-schema.js';

@injectable()
export class ExplorerConfigSchemaDefinition
  extends SchemaDefinitionBase<ExplorerConfigSchema>
  implements SchemaDefinition<ExplorerConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return ExplorerConfigSchema.name;
  }

  public get version(): Version<number> {
    return ExplorerConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<ExplorerConfigSchema> {
    return ExplorerConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new ExplorerConfigV1Migration()];
  }
}
