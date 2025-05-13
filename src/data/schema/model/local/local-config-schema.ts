// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {DeploymentSchema} from './deployment-schema.js';
import {UserIdentitySchema} from '../common/user-identity-schema.js';
import {Version} from '../../../../business/utils/version.js';
import {ApplicationVersionsSchema} from '../common/application-versions-schema.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type DeploymentName,
  type Realm,
  type Shard,
} from '../../../../types/index.js';
import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';

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
  @Type(() => ApplicationVersionsSchema)
  public versions: ApplicationVersionsSchema;

  @Expose()
  @Type(() => UserIdentitySchema)
  public userIdentity: UserIdentitySchema;

  @Expose()
  @Type(() => DeploymentSchema)
  public deployments: DeploymentSchema[];

  @Expose()
  @Type(() => Map)
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

  public addClusterRef(clusterReference: ClusterReference, context: string): void {
    this.clusterRefs.set(clusterReference, context);
  }

  public removeClusterRef(clusterReference: ClusterReference): void {
    this.clusterRefs.delete(clusterReference);
  }

  public addDeployment(deployment: DeploymentName, namespace: NamespaceName, realm: Realm, shard: Shard): void {
    this.deployments.push(new DeploymentSchema(deployment, namespace.name, [], realm, shard));
  }

  public removeDeployment(deployment: DeploymentName): void {
    this.deployments = this.deployments.filter((d): boolean => d.name !== deployment);
  }

  public addClusterRefToDeployment(clusterReference: ClusterReference, deployment: DeploymentName): void {
    const deploymentObject: DeploymentSchema = this.deployments.find(d => d.name === deployment);
    if (deploymentObject) {
      deploymentObject.clusters.push(clusterReference);
    }
  }
}
