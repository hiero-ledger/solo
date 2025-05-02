// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {type ObjectMapper} from '../../data/mapper/api/object-mapper.js';
import {ClassToObjectMapper} from '../../data/mapper/impl/ct-object-mapper.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {ApplicationVersions} from '../../data/schema/model/common/application-versions.js';
import {ReadRemoteConfigBeforeLoadError} from '../errors/read-remote-config-before-load-error.js';
import {WriteRemoteConfigBeforeLoadError} from '../errors/write-remote-config-before-load-error.js';
import {RemoteConfigSource} from '../../data/configuration/impl/remote-config-source.js';
import {RemoteConfigSchema} from '../../data/schema/migration/impl/remote/remote-config-schema.js';
import {YamlConfigMapStorageBackend} from '../../data/backend/impl/yaml-config-map-storage-backend.js';
import {type ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {RemoteConfigMetadata} from '../../data/schema/model/remote/remote-config-metadata.js';
import {Cluster} from '../../data/schema/model/common/cluster.js';
import {DeploymentState} from '../../data/schema/model/remote/deployment-state.js';
import {DeploymentHistory} from '../../data/schema/model/remote/deployment-history.js';
import {RemoteConfig} from '../../data/schema/model/remote/remote-config.js';

@injectable()
export class RemoteConfigRuntimeState {
  private readonly source: RemoteConfigSource;
  private readonly backend: YamlConfigMapStorageBackend;
  private readonly objectMapper: ObjectMapper;

  public constructor(configMap: ConfigMap) {
    this.backend = new YamlConfigMapStorageBackend(configMap);
    this.objectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    this.source = new RemoteConfigSource(new RemoteConfigSchema(this.objectMapper), this.objectMapper, this.backend);
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
      throw new ReadRemoteConfigBeforeLoadError('Attempting to read from remote config before loading it');
    }
  }

  public get schemaVersion(): number {
    this.failIfNotLoaded();
    return this.source.modelData.schemaVersion;
  }

  public get metadata(): RemoteConfigMetadata {
    this.failIfNotLoaded();
    return this.source.modelData.metadata;
  }

  public get versions(): ApplicationVersions {
    this.failIfNotLoaded();
    return this.source.modelData.versions;
  }

  public get clusters(): Cluster[] {
    this.failIfNotLoaded();
    return this.source.modelData.clusters;
  }

  public get state(): DeploymentState {
    this.failIfNotLoaded();
    return this.source.modelData.state;
  }

  public get history(): DeploymentHistory {
    this.failIfNotLoaded();
    return this.source.modelData.history;
  }

  public async modify(callback: (modelData: RemoteConfig) => Promise<void>): Promise<void> {
    if (!this.isLoaded()) {
      throw new WriteRemoteConfigBeforeLoadError('Attempting to modify remote config before loading it');
    }
    await callback(this.source.modelData);

    return this.write();
  }
}
