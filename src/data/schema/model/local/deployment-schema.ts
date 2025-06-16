// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {
  type ClusterReferenceName,
  type DeploymentName,
  type NamespaceNameAsString,
  type Realm,
  type Shard,
} from '../../../../types/index.js';

@Exclude()
export class DeploymentSchema {
  @Expose()
  public name: DeploymentName;

  @Expose()
  public namespace: NamespaceNameAsString;

  @Expose()
  public clusters: ClusterReferenceName[];

  @Expose()
  public realm: Realm;

  @Expose()
  public shard: Shard;

  public constructor(
    name?: DeploymentName,
    namespace?: NamespaceNameAsString,
    clusters?: ClusterReferenceName[],
    realm?: Realm,
    shard?: Shard,
  ) {
    this.name = name ?? '';
    this.namespace = namespace ?? '';
    this.clusters = clusters ?? [];
    this.realm = realm ?? 0;
    this.shard = shard ?? 0;
  }
}
