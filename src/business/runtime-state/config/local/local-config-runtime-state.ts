// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {LocalConfigSource} from '../../../../data/configuration/impl/local-config-source.js';
import {YamlFileStorageBackend} from '../../../../data/backend/impl/yaml-file-storage-backend.js';
import {ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {ClassToObjectMapper} from '../../../../data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../data/key/config-key-formatter.js';
import {LocalConfigSchemaDefinition} from '../../../../data/schema/migration/impl/local/local-config-schema-definition.js';
import {LocalConfigSchema} from '../../../../data/schema/model/local/local-config-schema.js';
import {LoadLocalConfigError} from '../../../errors/load-local-config-error.js';
import {RefreshLocalConfigSourceError} from '../../../errors/refresh-local-config-source-error.js';
import {WriteLocalConfigFileError} from '../../../errors/write-local-config-file-error.js';
import {PathEx} from '../../../utils/path-ex.js';
import fs from 'node:fs';
import {LocalConfig} from './local-config.js';

@injectable()
export class LocalConfigRuntimeState {
  private readonly source: LocalConfigSource;
  private readonly backend: YamlFileStorageBackend;
  private readonly objectMapper: ObjectMapper;

  private _localConfig: LocalConfig;

  public constructor(
    @inject(InjectTokens.HomeDirectory) private readonly basePath: string,
    @inject(InjectTokens.LocalConfigFileName) private readonly fileName: string,
  ) {
    this.fileName = patchInject(fileName, InjectTokens.LocalConfigFileName, this.constructor.name);
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);

    this.backend = new YamlFileStorageBackend(this.basePath);
    this.objectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    this.source = new LocalConfigSource(
      fileName,
      new LocalConfigSchemaDefinition(this.objectMapper),
      this.objectMapper,
      this.backend,
      LocalConfigSchema.EMPTY,
    );

    this.refresh();
  }

  public get configuration(): LocalConfig {
    return this._localConfig;
  }

  // Loads the source data and writes it back in case of migrations.
  public async load(): Promise<void> {
    if (!this.configFileExists()) {
      throw new LoadLocalConfigError('Configuration file does not exist');
    }

    try {
      await this.source.refresh();
      this.refresh();
    } catch (error) {
      throw new RefreshLocalConfigSourceError('Failed to refresh local config source', error);
    }

    try {
      await this.persist();
    } catch (error) {
      throw new WriteLocalConfigFileError('Failed to write local config file', error);
    }
  }

  public async persist(): Promise<void> {
    return await this.source.persist();
  }

  private refresh(): void {
    this._localConfig = new LocalConfig(this.source.modelData);
  }

  public configFileExists(): boolean {
    try {
      return fs.existsSync(PathEx.join(this.basePath, this.fileName));
    } catch {
      return false;
    }
  }
}
