// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {EnvironmentStorageBackend} from '../../../../data/backend/impl/environment-storage-backend.js';
import {ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {ClassToObjectMapper} from '../../../../data/mapper/impl/class-to-object-mapper.js';
import {EnvironmentConfig} from './environment-config.js';
import {EnvironmentConfigSource} from '../../../../data/configuration/impl/environment-config-source.js';
import {RefreshEnvironmentRuntimeSourceError} from '../../../errors/refresh-environment-runtime-source-error.js';
import {EnvironmentKeyFormatter} from '../../../../data/key/environment-key-formatter.js';

@injectable()
export class EnvironmentConfigRuntimeState {
  private readonly source: EnvironmentConfigSource;
  private readonly backend: EnvironmentStorageBackend;
  private readonly objectMapper: ObjectMapper;

  private _state: EnvironmentConfig;

  public constructor(@inject(InjectTokens.EnvironmentStoragePrefix) private readonly prefix: string) {
    this.prefix = patchInject(InjectTokens.EnvironmentStoragePrefix, this.prefix, this.constructor.name);
    this.backend = new EnvironmentStorageBackend(this.prefix);
    this.objectMapper = new ClassToObjectMapper(EnvironmentKeyFormatter.instance());
    this.source = new EnvironmentConfigSource(this.objectMapper, this.prefix);

    this.refresh();
  }

  public get state(): EnvironmentConfig {
    return this._state;
  }

  // Loads the source data and writes it back in case of migrations.
  public async load(): Promise<void> {
    try {
      await this.source.refresh();
      this.refresh();
    } catch (error) {
      throw new RefreshEnvironmentRuntimeSourceError('Failed to refresh user input runtime source', error);
    }
  }

  private refresh(): void {
    this._state = new EnvironmentConfig(this.source.modelData);
  }
}
