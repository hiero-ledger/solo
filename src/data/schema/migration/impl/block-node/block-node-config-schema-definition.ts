// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {BlockNodeConfigV1Migration} from './block-node-config-v1-migration.js';
import {BlockNodeConfigSchema} from '../../../model/block-node/block-node-config-schema.js';

@injectable()
export class BlockNodeConfigSchemaDefinition
  extends SchemaDefinitionBase<BlockNodeConfigSchema>
  implements SchemaDefinition<BlockNodeConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return BlockNodeConfigSchema.name;
  }

  public get version(): Version<number> {
    return BlockNodeConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<BlockNodeConfigSchema> {
    return BlockNodeConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new BlockNodeConfigV1Migration()];
  }
}
