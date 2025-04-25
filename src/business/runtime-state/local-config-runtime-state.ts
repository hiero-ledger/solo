// SPDX-License-Identifier: Apache-2.0

import {YamlFileStorageBackend} from '../../data/backend/impl/yaml-file-storage-backend.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {LocalConfigSource} from '../../data/configuration/impl/local-config-source.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {LocalConfigSchema} from '../../data/schema/migration/impl/local/local-config-schema.js';
import {type ObjectMapper} from '../../data/mapper/api/object-mapper.js';
import {CTObjectMapper} from '../../data/mapper/impl/ct-object-mapper.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {UserIdentity} from '../../data/schema/model/common/user-identity.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {ErrorMessages} from '../../core/error-messages.js';
import {Deployment} from '../../data/schema/model/local/deployment.js';
import {ApplicationVersions} from '../../data/schema/model/common/application-versions.js';
import {LocalConfig} from '../../data/schema/model/local/local-config.js';

@injectable()
export class LocalConfigRuntimeState {
  private readonly source: LocalConfigSource;
  private readonly backend: YamlFileStorageBackend;

  public constructor(
    @inject(InjectTokens.HomeDirectory) private readonly basePath: string,
    @inject(InjectTokens.LocalConfigFileName) private readonly fileName: string,
  ) {
    this.fileName = patchInject(fileName, InjectTokens.LocalConfigFileName, this.constructor.name);
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);

    this.backend = new YamlFileStorageBackend(basePath);
    const objectMapper: ObjectMapper = new CTObjectMapper(ConfigKeyFormatter.instance());
    this.source = new LocalConfigSource(fileName, new LocalConfigSchema(objectMapper), objectMapper, this.backend);
  }

  private async write(): Promise<void> {
    return this.source.persist();
  }

  private isLoaded(): boolean {
    try {
      return !!this.source.properties();
    } catch {
      return false;
    }
  }

  private failIfNotLoaded(): void {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_READING_BEFORE_LOADING);
    }
  }

  public get userIdentity(): Readonly<UserIdentity> {
    this.failIfNotLoaded();
    return this.source.modelData.userIdentity;
  }

  public get versions(): Readonly<ApplicationVersions> {
    this.failIfNotLoaded();
    return this.source.modelData.versions;
  }

  public get deployments(): Readonly<Deployment[]> {
    this.failIfNotLoaded();
    return this.source.modelData.deployments;
  }

  public get clusterRefs(): Readonly<Map<string, string>> {
    this.failIfNotLoaded();
    return this.source.modelData.clusterRefs;
  }

  public async modify(callback: (source: LocalConfig) => Promise<void>): Promise<void> {
    this.failIfNotLoaded();
    await callback(this.source.modelData);
    return this.write();
  }

  public async configFileExists(): Promise<boolean> {
    try {
      return (await this.backend.readObject(this.fileName)) !== undefined;
    } catch {
      return false;
    }
  }

  public async create(): Promise<void> {
    return this.backend.writeObject(this.fileName, {});
  }

  // Loads the source data and writes it back in case of migrations
  public async load(): Promise<void> {
    if (await this.configFileExists()) {
      await this.source.refresh();
    } else {
      await this.create();
    }

    return this.write();
  }
}
