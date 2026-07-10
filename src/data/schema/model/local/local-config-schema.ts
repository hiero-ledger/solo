// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {DeploymentSchema} from './deployment-schema.js';
import {UserIdentitySchema} from '../common/user-identity-schema.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';
import {ApplicationVersionsSchema} from '../common/application-versions-schema.js';
import {type ClusterReferences} from '../../../../types/index.js';

@Exclude()
export class LocalConfigSchema {
  // TODO(config-checks #4 — schema version constant): SCHEMA_VERSION (1) lags the latest local
  //   migration (2), so fresh configs are written at a stale version. Reconcile to a single source
  //   of truth (derive from the migration list, or assert they match at startup). Prerequisite for #3.
  //   See docs/design/architecture/system/config-checks-to-add.md
  public static readonly SCHEMA_VERSION: SemanticVersion<number> = new SemanticVersion(1);
  public static readonly EMPTY: LocalConfigSchema = new LocalConfigSchema(
    LocalConfigSchema.SCHEMA_VERSION.major,
    new ApplicationVersionsSchema(),
    [],
    new Map<string, string>(),
    new UserIdentitySchema(),
  );

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type((): typeof ApplicationVersionsSchema => ApplicationVersionsSchema)
  public versions: ApplicationVersionsSchema;

  @Expose()
  @Type((): typeof UserIdentitySchema => UserIdentitySchema)
  public userIdentity: UserIdentitySchema;

  @Expose()
  @Type((): typeof DeploymentSchema => DeploymentSchema)
  public deployments: DeploymentSchema[];

  @Expose()
  @Type((): MapConstructor => Map)
  public clusterRefs: ClusterReferences;

  public constructor(
    schemaVersion?: number,
    versions?: ApplicationVersionsSchema,
    deployments?: DeploymentSchema[],
    clusterReferences?: ClusterReferences,
    userIdentity?: UserIdentitySchema,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.versions = versions ?? new ApplicationVersionsSchema();
    this.deployments = deployments ?? [];
    this.clusterRefs = clusterReferences ?? new Map<string, string>();
    this.userIdentity = userIdentity ?? new UserIdentitySchema();
  }
}
