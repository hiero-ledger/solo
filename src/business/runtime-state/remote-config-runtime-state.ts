// SPDX-License-Identifier: Apache-2.0

import {YamlFileStorageBackend} from '../../data/backend/impl/yaml-file-storage-backend.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type ObjectMapper} from '../../data/mapper/api/object-mapper.js';
import {CTObjectMapper} from '../../data/mapper/impl/ct-object-mapper.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {UserIdentity} from '../../data/schema/model/common/user-identity.js';
import {Deployment} from '../../data/schema/model/local/deployment.js';
import {ApplicationVersions} from '../../data/schema/model/common/application-versions.js';
import {LocalConfig} from '../../data/schema/model/local/local-config.js';
import {DeploymentName, Realm, Shard} from '../../core/config/remote/types.js';

import {DeploymentNotFoundError} from '../errors/deployment-not-found-error.js';
import {ReadRemoteConfigBeforeLoadError} from '../errors/read-remote-config-before-load-error.js';
import {WriteRemoteConfigBeforeLoadError} from '../errors/write-remote-config-before-load-error.js';
import {RemoteConfigSource} from '../../data/configuration/impl/remote-config-source.js';
import {RemoteConfigSchema} from '../../data/schema/migration/impl/remte/remote-config-schema.js';

@injectable()
export class RemoteConfigRuntimeState {
  private readonly source: RemoteConfigSource;
  private readonly backend: YamlFileStorageBackend;
  private readonly objectMapper: ObjectMapper;

  public constructor(
    @inject(InjectTokens.HomeDirectory) private readonly basePath: string,
    @inject(InjectTokens.LocalConfigFileName) private readonly fileName: string,
  ) {
    this.fileName = patchInject(fileName, InjectTokens.LocalConfigFileName, this.constructor.name);
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);

    this.backend = new YamlFileStorageBackend(basePath);
    this.objectMapper = new CTObjectMapper(ConfigKeyFormatter.instance());
    this.source = new RemoteConfigSource(
      fileName,
      new RemoteConfigSchema(this.objectMapper),
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
      throw new ReadRemoteConfigBeforeLoadError('Attempting to read from local config before loading it');
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
      throw new WriteRemoteConfigBeforeLoadError('Attempting to modify local config before loading it');
    }
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
    return this.backend.writeObject(this.fileName, this.objectMapper.toObject(new LocalConfig()));
  }

  // Loads the source data and writes it back in case of migrations
  // If the source data does not exist, an empty file is created
  public async load(): Promise<void> {
    if (!(await this.configFileExists())) {
      await this.create();
    }
    await this.source.refresh();
    await this.write();
  }
}