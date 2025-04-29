// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {Deployment} from './deployment.js';
import {UserIdentity} from '../common/user-identity.js';
import {Version} from '../../../../business/utils/version.js';
import {ApplicationVersions} from '../common/application-versions.js';
import {
  type ClusterReference,
  type DeploymentName,
  type Realm,
  type Shard,
} from '../../../../core/config/remote/types.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {DeploymentCommand} from '../../../../commands/deployment.js';

@Exclude()
export class LocalConfig {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type(() => ApplicationVersions)
  public versions: ApplicationVersions;

  @Expose()
  @Type(() => UserIdentity)
  public userIdentity: UserIdentity;

  @Expose()
  @Type(() => Deployment)
  public deployments: Deployment[];

  @Expose()
  @Type(() => Map)
  public clusterRefs: Map<string, string>;

  constructor(
    schemaVersion?: number,
    versions?: ApplicationVersions,
    deployments?: Deployment[],
    clusterReferences?: Map<string, string>,
    userIdentity?: UserIdentity,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.versions = versions ?? new ApplicationVersions();
    this.deployments = deployments ?? [];
    this.clusterRefs = clusterReferences ?? new Map<string, string>();
    this.userIdentity = userIdentity ?? new UserIdentity();
  }

  public addClusterRef(clusterReference: ClusterReference, context: string): void {
    this.clusterRefs.set(clusterReference, context);
  }

  public removeClusterRef(clusterReference: ClusterReference): void {
    this.clusterRefs.delete(clusterReference);
  }

  public addDeployment(deployment: DeploymentName, namespace: NamespaceName, realm: Realm, shard: Shard): void {
    this.deployments.push(new Deployment(deployment, namespace.name, [], realm, shard));
  }

  public removeDeployment(deployment: DeploymentName): void {
    this.deployments = this.deployments.filter((d): boolean => d.name !== deployment);
  }

  public addClusterRefToDeployment(clusterReference: ClusterReference, deployment: DeploymentName): void {
    const deploymentObject: Deployment = this.deployments.find(d => d.name === deployment);
    if (deploymentObject) {
      deploymentObject.clusters.push(clusterReference);
    }
  }
}
