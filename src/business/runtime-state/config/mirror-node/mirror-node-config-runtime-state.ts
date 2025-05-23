// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {Config} from '../../../../data/configuration/api/config.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {DefaultConfigSource} from '../../../../data/configuration/impl/default-config-source.js';
import {PathEx} from '../../../utils/path-ex.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {UnloadedConfigError} from '../../errors/unloaded-config-error.js';
import {MirrorNodeConfig} from './mirror-node-config.js';
import {MirrorNodeConfigSchema} from '../../../../data/schema/model/mirror-node/mirror-node-config-schema.js';
import {
  MirrorNodeConfigSchemaDefinition
} from '../../../../data/schema/migration/impl/mirror-node/mirror-node-config-schema-definition.js';

@injectable()
export class MirrorNodeConfigRuntimeState {
  private readonly config: Config;
  private _mirrorNodeConfig: MirrorNodeConfig;

  public constructor(
    @inject(InjectTokens.ObjectMapper) private readonly objectMapper: ObjectMapper,
    @inject(InjectTokens.ConfigProvider) private readonly configProvider: ConfigProvider,
  ) {
    const defaultConfigSource: DefaultConfigSource<MirrorNodeConfigSchema> =
      new DefaultConfigSource<MirrorNodeConfigSchema>(
        'mirror-node-config.yaml',
        PathEx.join('resources', 'config'),
        new MirrorNodeConfigSchemaDefinition(objectMapper),
        objectMapper,
      );
    this.config = configProvider
      .builder()
      .withPrefix('SOLO_MIRROR_NODE')
      .withDefaultSources()
      .withSources(defaultConfigSource)
      .withMergeSourceValues(true)
      .build();
  }

  public async load(): Promise<void> {
    for (const source of this.config.sources) {
      await source.load();
    }
    this._mirrorNodeConfig = new MirrorNodeConfig(this.config.asObject(MirrorNodeConfigSchema, ''));
  }

  public get mirrorNodeConfig(): MirrorNodeConfig {
    if (!this._mirrorNodeConfig) {
      throw new UnloadedConfigError('MirrorNodeConfig is not loaded yet.');
    }
    return this._mirrorNodeConfig;
  }
}
