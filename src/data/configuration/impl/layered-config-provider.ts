// SPDX-License-Identifier: Apache-2.0

import {type ConfigProvider} from '../api/config-provider.js';
import {type ConfigBuilder} from '../api/config-builder.js';
import {type Config} from '../api/config.js';
import {LayeredConfigBuilder} from './layered-config-builder.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {container} from 'tsyringe-neo';

export class LayeredConfigProvider implements ConfigProvider {
  private _config: Config | undefined;
  private readonly mapper: ObjectMapper;

  public constructor(private readonly prefix?: string) {
    this.mapper = container.resolve(InjectTokens.ObjectMapper);
  }

  public builder(): ConfigBuilder {
    return new LayeredConfigBuilder(this.mapper, this.prefix);
  }

  public config(): Config {
    if (!this._config) {
      throw new ConfigurationError('config not registered');
    }

    return this._config;
  }

  public register(config: Config): void {
    if (!config) {
      throw new IllegalArgumentError('config must not be null or undefined');
    }

    if (!this._config) {
      throw new ConfigurationError('config already registered');
    }

    this._config = config;
  }

  public release(): void {
    this._config = undefined;
  }
}
