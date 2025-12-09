// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {DeploymentSchema} from './deployment-schema.js';
import {UserIdentitySchema} from '../common/user-identity-schema.js';
import {Version} from '../../../../business/utils/version.js';
import {ApplicationVersionsSchema} from '../common/application-versions-schema.js';
import {type ClusterReferences} from '../../../../types/index.js';

@Exclude()
export class LocalConfigSchema {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);
  public static readonly EMPTY: LocalConfigSchema = new LocalConfigSchema(
    LocalConfigSchema.SCHEMA_VERSION.value,
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
