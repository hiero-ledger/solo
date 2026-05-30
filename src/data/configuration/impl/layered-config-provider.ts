// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import {type ConfigProvider} from '../api/config-provider.js';
import {type ConfigBuilder} from '../api/config-builder.js';
import {type Config} from '../api/config.js';
import {LayeredConfigBuilder} from './layered-config-builder.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {ConfigurationError} from '../api/configuration-error.js';

@injectable()
export class LayeredConfigProvider implements ConfigProvider {
  private _config: Config | undefined;

  public constructor(
    @inject(InjectTokens.ObjectMapper) private readonly mapper: ObjectMapper,
    private readonly prefix: string = 'SOLO',
  ) {
    this.mapper = patchInject(mapper, InjectTokens.ObjectMapper, LayeredConfigProvider.name);
  }

  public builder(): ConfigBuilder {
    return new LayeredConfigBuilder(this, this.mapper, this.prefix);
  }

  public config(): Config {
    if (!this._config) {
      throw new ConfigurationError('config not registered');
    }

    return this._config;
  }

  public register(config: Config): void {
    if (!config) {
      throw new SoloErrors.validation.illegalArgument('config must not be null or undefined');
    }

    if (this._config) {
      throw new ConfigurationError('config already registered');
    }

    this._config = config;
  }

  public release(): void {
    this._config = undefined;
  }
}
