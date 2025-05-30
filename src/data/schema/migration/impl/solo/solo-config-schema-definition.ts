// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {SoloConfigV1Migration} from './solo-config-v1-migration.js';
import {SoloConfigSchema} from '../../../model/solo/solo-config-schema.js';

@injectable()
export class SoloConfigSchemaDefinition
  extends SchemaDefinitionBase<SoloConfigSchema>
  implements SchemaDefinition<SoloConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return SoloConfigSchema.name;
  }

  public get version(): Version<number> {
    return SoloConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<SoloConfigSchema> {
    return SoloConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new SoloConfigV1Migration()];
  }
}
