// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {Config} from '../../../../data/configuration/api/config.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {DefaultConfigSource} from '../../../../data/configuration/impl/default-config-source.js';
import {PathEx} from '../../../utils/path-ex.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {UnloadedConfigError} from '../../errors/unloaded-config-error.js';
import {ExplorerConfig} from './explorer-config.js';
import {ExplorerConfigSchema} from '../../../../data/schema/model/explorer/explorer-config-schema.js';
import {ExplorerConfigSchemaDefinition} from '../../../../data/schema/migration/impl/explorer/explorer-config-schema-definition.js';

@injectable()
export class ExplorerConfigRuntimeState {
  private readonly config: Config;
  private _explorerConfig: ExplorerConfig;

  public constructor(
    @inject(InjectTokens.ObjectMapper) private readonly objectMapper: ObjectMapper,
    @inject(InjectTokens.ConfigProvider) private readonly configProvider: ConfigProvider,
  ) {
    const defaultConfigSource: DefaultConfigSource<ExplorerConfigSchema> =
      new DefaultConfigSource<ExplorerConfigSchema>(
        'explorer-config.yaml',
        PathEx.join('resources', 'config'),
        new ExplorerConfigSchemaDefinition(objectMapper),
        objectMapper,
      );
    this.config = configProvider
      .builder()
      .withPrefix('SOLO_EXPLORER')
      .withDefaultSources()
      .withSources(defaultConfigSource)
      .withMergeSourceValues(true)
      .build();
  }

  public async load(): Promise<void> {
    for (const source of this.config.sources) {
      await source.load();
    }
    this._explorerConfig = new ExplorerConfig(this.config.asObject(ExplorerConfigSchema, ''));
  }

  public get explorerConfig(): ExplorerConfig {
    if (!this._explorerConfig) {
      throw new UnloadedConfigError('ExplorerConfig is not loaded yet.');
    }
    return this._explorerConfig;
  }
}
