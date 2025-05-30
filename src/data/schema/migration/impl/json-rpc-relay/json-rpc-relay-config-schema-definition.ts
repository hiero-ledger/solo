// SPDX-License-Identifier: Apache-2.0

import {type SchemaDefinition} from '../../api/schema-definition.js';
import {type Version} from '../../../../../business/utils/version.js';
import {type ClassConstructor} from '../../../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from '../../api/schema-migration.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../mapper/api/object-mapper.js';
import {SchemaDefinitionBase} from '../../api/schema-definition-base.js';
import {JsonRpcRelayConfigV1Migration} from './json-rpc-relay-config-v1-migration.js';
import {JsonRpcRelayConfigSchema} from '../../../model/json-rpc-relay/json-rpc-relay-config-schema.js';

@injectable()
export class JsonRpcRelayConfigSchemaDefinition
  extends SchemaDefinitionBase<JsonRpcRelayConfigSchema>
  implements SchemaDefinition<JsonRpcRelayConfigSchema>
{
  public constructor(@inject(InjectTokens.ObjectMapper) mapper: ObjectMapper) {
    super(mapper);
  }

  public get name(): string {
    return JsonRpcRelayConfigSchema.name;
  }

  public get version(): Version<number> {
    return JsonRpcRelayConfigSchema.SCHEMA_VERSION;
  }

  public get classConstructor(): ClassConstructor<JsonRpcRelayConfigSchema> {
    return JsonRpcRelayConfigSchema;
  }

  public get migrations(): SchemaMigration[] {
    return [new JsonRpcRelayConfigV1Migration()];
  }
}
