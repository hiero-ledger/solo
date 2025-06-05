// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {Config} from '../../../../data/configuration/api/config.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {DefaultConfigSource} from '../../../../data/configuration/impl/default-config-source.js';
import {PathEx} from '../../../utils/path-ex.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {UnloadedConfigError} from '../../errors/unloaded-config-error.js';
import {BlockNodeConfig} from './block-node-config.js';
import {BlockNodeConfigSchema} from '../../../../data/schema/model/block-node/block-node-config-schema.js';
import {BlockNodeConfigSchemaDefinition} from '../../../../data/schema/migration/impl/block-node/block-node-config-schema-definition.js';

@injectable()
export class BlockNodeConfigRuntimeState {
  private readonly config: Config;
  private _blockNodeConfig: BlockNodeConfig;

  public constructor(
    @inject(InjectTokens.ObjectMapper) private readonly objectMapper: ObjectMapper,
    @inject(InjectTokens.ConfigProvider) private readonly configProvider: ConfigProvider,
  ) {
    const defaultConfigSource: DefaultConfigSource<BlockNodeConfigSchema> =
      new DefaultConfigSource<BlockNodeConfigSchema>(
        'block-node-config.yaml',
        PathEx.join('resources', 'config'),
        new BlockNodeConfigSchemaDefinition(objectMapper),
        objectMapper,
      );
    this.config = configProvider
      .builder()
      .withPrefix('SOLO_BLOCK_NODE')
      .withDefaultSources()
      .withSources(defaultConfigSource)
      .withMergeSourceValues(true)
      .build();
  }

  public async load(): Promise<void> {
    for (const source of this.config.sources) {
      await source.load();
    }
    this._blockNodeConfig = new BlockNodeConfig(this.config.asObject(BlockNodeConfigSchema, ''));
  }

  public get blockNodeConfig(): BlockNodeConfig {
    if (!this._blockNodeConfig) {
      throw new UnloadedConfigError('BlockNodeConfig is not loaded yet.');
    }
    return this._blockNodeConfig;
  }
}
