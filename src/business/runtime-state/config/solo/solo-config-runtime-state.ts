// SPDX-License-Identifier: Apache-2.0

import {container, injectable} from 'tsyringe-neo';
import {Config} from '../../../../data/configuration/api/config.js';
import {LayeredConfigProvider} from '../../../../data/configuration/impl/layered-config-provider.js';
import {ConfigProvider} from '../../../../data/configuration/api/config-provider.js';
import {DefaultConfigSource} from '../../../../data/configuration/impl/default-config-source.js';
import {SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';
import {PathEx} from '../../../utils/path-ex.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {SoloConfigSchemaDefinition} from '../../../../data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {SoloConfig} from './solo-config.js';
import {UnloadedConfigError} from '../../errors/unloaded-config-error.js';

@injectable()
export class SoloConfigRuntimeState {
  private readonly config: Config;
  private _soloConfig: SoloConfig;

  public constructor() {
    const objectMapper: ObjectMapper = container.resolve(InjectTokens.ObjectMapper);
    const configProvider: ConfigProvider = new LayeredConfigProvider('SOLO_SC');
    const defaultConfigSource: DefaultConfigSource<SoloConfigSchema> = new DefaultConfigSource<SoloConfigSchema>(
      'solo-config.yaml',
      PathEx.join('resources', 'config'),
      new SoloConfigSchemaDefinition(objectMapper),
      objectMapper,
    );
    this.config = configProvider
      .builder()
      .withDefaultSources()
      .withSources(defaultConfigSource)
      .withMergeSourceValues(true)
      .build();
  }

  public async load(): Promise<void> {
    for (const source of this.config.sources) {
      await source.load();
    }
    this._soloConfig = new SoloConfig(this.config.asObject(SoloConfigSchema, ''));
  }

  public get soloConfig(): SoloConfig {
    if (!this._soloConfig) {
      throw new UnloadedConfigError('SoloConfig is not loaded yet.');
    }
    return this._soloConfig;
  }
}
