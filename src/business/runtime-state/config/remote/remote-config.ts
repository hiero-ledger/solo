// SPDX-License-Identifier: Apache-2.0

import {ComponentsDataWrapper} from '../../../../core/config/remote/components-data-wrapper.js';
import {type Facade} from '../../facade/facade.js';
import {type RemoteConfigSchema} from '../../../../data/schema/model/remote/remote-config-schema.js';
import {type ComponentsDataWrapperApi} from '../../../../core/config/remote/api/components-data-wrapper-api.js';
import {type RemoteConfigMetadataSchema} from '../../../../data/schema/model/remote/remote-config-metadata-schema.js';
import {type ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';
import {type ClusterSchema} from '../../../../data/schema/model/common/cluster-schema.js';
import {type DeploymentStateSchema} from '../../../../data/schema/model/remote/deployment-state-schema.js';
import {type DeploymentHistorySchema} from '../../../../data/schema/model/remote/deployment-history-schema.js';

export class RemoteConfig implements Facade<RemoteConfigSchema> {
  private readonly _components: ComponentsDataWrapperApi;
  private readonly _schemaVersion: number;
  private readonly _metadata: Readonly<RemoteConfigMetadataSchema>;
  private readonly _versions: ApplicationVersionsSchema;
  private readonly _clusters: Readonly<ClusterSchema>[];
  private readonly _state: Readonly<DeploymentStateSchema>;
  private readonly _history: Readonly<DeploymentHistorySchema>;

  public constructor(public readonly encapsulatedObject: RemoteConfigSchema) {
    this._components = new ComponentsDataWrapper(encapsulatedObject.state);
    this._schemaVersion = encapsulatedObject.schemaVersion;
    this._metadata = encapsulatedObject.metadata;
    this._versions = encapsulatedObject.versions;
    this._clusters = encapsulatedObject.clusters;
    this._state = encapsulatedObject.state;
  }

  public get components(): ComponentsDataWrapperApi {
    return this._components;
  }

  public get schemaVersion(): number {
    return this._schemaVersion;
  }

  public get metadata(): Readonly<RemoteConfigMetadataSchema> {
    return this._metadata;
  }

  public get versions(): ApplicationVersionsSchema {
    return this._versions;
  }

  public get clusters(): Readonly<Readonly<ClusterSchema>[]> {
    return this._clusters;
  }

  public get state(): DeploymentStateSchema {
    return this._state;
  }

  public get history(): Readonly<DeploymentHistorySchema> {
    return this._history;
  }

  public addCluster(cluster: ClusterSchema): void {
    this._clusters.push(cluster);
  }
}
