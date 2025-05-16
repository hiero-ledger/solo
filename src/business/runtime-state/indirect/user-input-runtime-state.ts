// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {LocalConfigSource} from '../../../../data/configuration/impl/local-config-source.js';
import {EnvironmentStorageBackend} from '../../../data/backend/impl/environment-storage-backend.js';
import {ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {ClassToObjectMapper} from '../../../../data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../data/key/config-key-formatter.js';
import {RefreshLocalConfigSourceError} from '../../../errors/refresh-local-config-source-error.js';
import {PathEx} from '../../../utils/path-ex.js';
import fs from 'node:fs';
import {SoloState} from './solo-state.js';
import {EnvironmentConfigSource} from '../../../data/configuration/impl/environment-config-source.js';

@injectable()
export class UserInputRuntimeState {
  private readonly source: LocalConfigSource;
  private readonly backend: EnvironmentStorageBackend;
  private readonly objectMapper: ObjectMapper;

  private _soloState: SoloState;

  public constructor(@inject(InjectTokens.EnvironmentStoragePrefix) private readonly prefix: string) {
    this.prefix = patchInject(InjectTokens.EnvironmentStoragePrefix, this.prefix);
    this.backend = new EnvironmentStorageBackend(this.prefix);
    this.objectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    this.source = new EnvironmentConfigSource(this.objectMapper, this.prefix);

    this.refresh();
  }

  public get state(): SoloState {
    return this._soloState;
  }

  // Loads the source data and writes it back in case of migrations.
  public async load(): Promise<void> {
    try {
      await this.source.refresh();
      this.refresh();
    } catch (error) {
      throw new RefreshLocalConfigSourceError('Failed to refresh local config source', error);
    }
  }

  private refresh(): void {
    this._soloState = new SoloState(this.source.modelData);
  }

  public configFileExists(): boolean {
    try {
      return fs.existsSync(PathEx.join(this.basePath, this.fileName));
    } catch {
      return false;
    }
  }
}