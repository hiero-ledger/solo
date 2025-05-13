// SPDX-License-Identifier: Apache-2.0

import {type DeploymentSchema} from '../../../../data/schema/model/local/deployment-schema.js';
import {type Realm, type Shard} from '../../../../types/index.js';
import {type Facade} from '../../facade/facade.js';
import {type BackedArrayList} from '../../collection/backed-array-list.js';
import {StringFacade} from '../../facade/string-facade.js';
import {MutableBackedArrayList} from '../../collection/mutable-backed-array-list.js';

export class Deployment implements Facade<DeploymentSchema> {
  private readonly clusterList: BackedArrayList<StringFacade, string>;

  public constructor(public readonly backingObject: DeploymentSchema) {
    // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
    this.clusterList = new MutableBackedArrayList<StringFacade, String>(StringFacade, String, backingObject.clusters);
  }

  public get name(): string {
    return this.backingObject.name;
  }

  public set name(name: string) {
    this.backingObject.name = name;
  }

  public get namespace(): string {
    return this.backingObject.namespace;
  }

  public set namespace(namespace: string) {
    this.backingObject.namespace = namespace;
  }

  public get realm(): Realm {
    return this.backingObject.realm;
  }

  public set realm(realm: Realm) {
    this.backingObject.realm = realm;
  }

  public get shard(): Shard {
    return this.backingObject.shard;
  }

  public set shard(shard: Shard) {
    this.backingObject.shard = shard;
  }

  public get clusters(): BackedArrayList<StringFacade, string> {
    return this.clusterList;
  }
}
