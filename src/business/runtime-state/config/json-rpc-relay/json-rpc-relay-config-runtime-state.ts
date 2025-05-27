// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {Config} from '../../../../data/configuration/api/config.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {DefaultConfigSource} from '../../../../data/configuration/impl/default-config-source.js';
import {PathEx} from '../../../utils/path-ex.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {UnloadedConfigError} from '../../errors/unloaded-config-error.js';
import {JsonRpcRelayConfig} from './json-rpc-relay-config.js';
import {JsonRpcRelayConfigSchema} from '../../../../data/schema/model/json-rpc-relay/json-rpc-relay-config-schema.js';
import {JsonRpcRelayConfigSchemaDefinition} from '../../../../data/schema/migration/impl/json-rpc-relay/json-rpc-relay-config-schema-definition.js';

@injectable()
export class JsonRpcRelayConfigRuntimeState {
  private readonly config: Config;
  private _jsonRpcRelayConfig: JsonRpcRelayConfig;

  public constructor(
    @inject(InjectTokens.ObjectMapper) private readonly objectMapper: ObjectMapper,
    @inject(InjectTokens.ConfigProvider) private readonly configProvider: ConfigProvider,
  ) {
    const defaultConfigSource: DefaultConfigSource<JsonRpcRelayConfigSchema> =
      new DefaultConfigSource<JsonRpcRelayConfigSchema>(
        'json-rpc-relay-config.yaml',
        PathEx.join('resources', 'config'),
        new JsonRpcRelayConfigSchemaDefinition(objectMapper),
        objectMapper,
      );
    this.config = configProvider
      .builder()
      .withPrefix('SOLO_JSON_RPC_RELAY')
      .withDefaultSources()
      .withSources(defaultConfigSource)
      .withMergeSourceValues(true)
      .build();
  }

  public async load(): Promise<void> {
    for (const source of this.config.sources) {
      await source.load();
    }
    this._jsonRpcRelayConfig = new JsonRpcRelayConfig(this.config.asObject(JsonRpcRelayConfigSchema, ''));
  }

  public get jsonRpcRelayConfig(): JsonRpcRelayConfig {
    if (!this._jsonRpcRelayConfig) {
      throw new UnloadedConfigError('JsonRpcRelayConfig is not loaded yet.');
    }
    return this._jsonRpcRelayConfig;
  }
}
