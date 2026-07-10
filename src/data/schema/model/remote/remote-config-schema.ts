// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {RemoteConfigMetadataSchema} from './remote-config-metadata-schema.js';
import {ApplicationVersionsSchema} from '../common/application-versions-schema.js';
import {ClusterSchema} from '../common/cluster-schema.js';
import {DeploymentStateSchema} from './deployment-state-schema.js';
import {DeploymentHistorySchema} from './deployment-history-schema.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';
import {RemoteConfigStructure} from './interfaces/remote-config-structure.js';

@Exclude()
export class RemoteConfigSchema implements RemoteConfigStructure {
  // TODO(config-checks #4 — schema version constant): SCHEMA_VERSION (1) lags the latest remote
  //   migration (8), so fresh configs are written at a stale version. Reconcile to a single source
  //   of truth (derive from the migration list, or assert they match at startup). Prerequisite for #3/#9.
  //   See docs/design/architecture/system/config-checks-to-add.md
  public static readonly SCHEMA_VERSION: SemanticVersion<number> = new SemanticVersion(1);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type((): typeof RemoteConfigMetadataSchema => RemoteConfigMetadataSchema)
  public metadata: RemoteConfigMetadataSchema;

  @Expose()
  @Type((): typeof ApplicationVersionsSchema => ApplicationVersionsSchema)
  public versions: ApplicationVersionsSchema;

  @Expose()
  @Type((): typeof ClusterSchema => ClusterSchema)
  public clusters: ClusterSchema[];

  @Expose()
  @Type((): typeof DeploymentStateSchema => DeploymentStateSchema)
  public state: DeploymentStateSchema;

  @Expose()
  @Type((): typeof DeploymentHistorySchema => DeploymentHistorySchema)
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
