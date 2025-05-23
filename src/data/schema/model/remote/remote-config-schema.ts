// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {RemoteConfigMetadataSchema} from './remote-config-metadata-schema.js';
import {ApplicationVersionsSchema} from '../common/application-versions-schema.js';
import {ClusterSchema} from '../common/cluster-schema.js';
import {DeploymentStateSchema} from './deployment-state-schema.js';
import {DeploymentHistorySchema} from './deployment-history-schema.js';
import {Version} from '../../../../business/utils/version.js';
import {RemoteConfigStructure} from './interfaces/remote-config-structure.js';

@Exclude()
export class RemoteConfigSchema implements RemoteConfigStructure {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type(() => RemoteConfigMetadataSchema)
  public metadata: RemoteConfigMetadataSchema;

  @Expose()
  @Type(() => ApplicationVersionsSchema)
  public versions: ApplicationVersionsSchema;

  @Expose()
  @Type(() => ClusterSchema)
  public clusters: ClusterSchema[];

  @Expose()
  @Type(() => DeploymentStateSchema)
  public state: DeploymentStateSchema;

  @Expose()
  @Type(() => DeploymentHistorySchema)
  public history: DeploymentHistorySchema;

  public constructor(
    schemaVersion?: number,
    metadata?: RemoteConfigMetadataSchema,
    versions?: ApplicationVersionsSchema,
    clusters?: ClusterSchema[],
    state?: DeploymentStateSchema,
    history?: DeploymentHistorySchema,
  ) {
    this.schemaVersion = schemaVersion || 0;
    this.metadata = metadata || new RemoteConfigMetadataSchema();
    this.versions = versions || new ApplicationVersionsSchema();
    this.clusters = clusters || [];
    this.state = state || new DeploymentStateSchema();
    this.history = history || new DeploymentHistorySchema();
  }
}
