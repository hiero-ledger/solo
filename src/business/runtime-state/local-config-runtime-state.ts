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
import {Deployment} from '../../data/schema/model/local/deployment.js';
import {ApplicationVersions} from '../../data/schema/model/common/application-versions.js';
import {LocalConfig} from '../../data/schema/model/local/local-config.js';
import {type ClusterReferences, DeploymentName, Realm, Shard} from '../../core/config/remote/types.js';
import {DeploymentNotFoundError} from '../errors/deployment-not-found-error.js';
import {ReadLocalConfigBeforeLoadError} from '../errors/read-local-config-before-load-error.js';
import {WriteLocalConfigBeforeLoadError} from '../errors/write-local-config-before-load-error.js';
import {ModifyLocalConfigError} from '../errors/modify-local-config-error.js';
import {LoadLocalConfigError} from '../errors/load-local-config-error.js';
import {CreateLocalConfigFileError} from '../errors/create-local-config-file-error.js';
import {RefreshLocalConfigSourceError} from '../errors/refresh-local-config-source-error.js';
import {WriteLocalConfigFileError} from '../errors/write-local-config-file-error.js';

@injectable()
export class LocalConfigRuntimeState {
  private readonly source: LocalConfigSource;
  private readonly backend: YamlFileStorageBackend;
  private readonly objectMapper: ObjectMapper;

  public constructor(
    @inject(InjectTokens.HomeDirectory) private readonly basePath: string,
    @inject(InjectTokens.LocalConfigFileName) private readonly fileName: string,
  ) {
    this.fileName = patchInject(fileName, InjectTokens.LocalConfigFileName, this.constructor.name);
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);

    this.backend = new YamlFileStorageBackend(this.basePath);
    this.objectMapper = new CTObjectMapper(ConfigKeyFormatter.instance());
    this.source = new LocalConfigSource(
      fileName,
      new LocalConfigSchema(this.objectMapper),
      this.objectMapper,
      this.backend,
    );
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
      throw new ReadLocalConfigBeforeLoadError('Attempting to read from local config before loading it');
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

  public get clusterRefs(): Readonly<ClusterReferences> {
    this.failIfNotLoaded();
    return this.source.modelData.clusterRefs;
  }

  public getDeployment(deploymentName: DeploymentName): Deployment {
    this.failIfNotLoaded();
    const deployment = this.deployments.find(d => d.name === deploymentName);
    if (!deployment) {
      throw new DeploymentNotFoundError(`Deployment ${deploymentName} not found in local config`);
    }
    return deployment;
  }

  public getRealm(deploymentName: DeploymentName): Realm {
    return this.getDeployment(deploymentName).realm;
  }

  public getShard(deploymentName: DeploymentName): Shard {
    return this.getDeployment(deploymentName).shard;
  }

  public async modify(callback: (modelData: LocalConfig) => Promise<void>): Promise<void> {
    if (!this.isLoaded()) {
      throw new WriteLocalConfigBeforeLoadError('Attempting to modify local config before loading it');
    }
    try {
      await callback(this.source.modelData);
    } catch (error) {
      throw new ModifyLocalConfigError('Failed to modify local config', error);
    }
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
    return this.backend.writeObject(this.fileName, this.objectMapper.toObject(new LocalConfig()));
  }

  // Loads the source data and writes it back in case of migrations
  // If the source data does not exist, an empty file is created
  public async load(): Promise<void> {
    if (!(await this.configFileExists())) {
      try {
        await this.create();
      } catch (error) {
        throw new CreateLocalConfigFileError('Failed to create local config file', error);
      }
    }
    try {
      await this.source.refresh();
    } catch (error) {
      throw new RefreshLocalConfigSourceError('Failed to refresh local config source', error);
    }
    try {
      await this.write();
    } catch (error) {
      throw new WriteLocalConfigFileError('Failed to write local config file', error);
    }
  }
}
