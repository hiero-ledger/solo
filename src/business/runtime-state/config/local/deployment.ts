// SPDX-License-Identifier: Apache-2.0

import {type DeploymentSchema} from '../../../../data/schema/model/local/deployment-schema.js';
import {type Realm, type Shard} from '../../../../types/index.js';
import {type Facade} from '../../facade/facade.js';
import {type FacadeArray} from '../../collection/facade-array.js';
import {StringFacade} from '../../facade/string-facade.js';
import {MutableFacadeArray} from '../../collection/mutable-facade-array.js';

export class Deployment implements Facade<DeploymentSchema> {
  private readonly clusterList: FacadeArray<StringFacade, string>;

  public constructor(public readonly encapsulatedObject: DeploymentSchema) {
    // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
    this.clusterList = new MutableFacadeArray<StringFacade, String>(StringFacade, String, encapsulatedObject.clusters);
  }

  public get name(): string {
    return this.encapsulatedObject.name;
  }

  public set name(name: string) {
    this.encapsulatedObject.name = name;
  }

  public get namespace(): string {
    return this.encapsulatedObject.namespace;
  }

  public set namespace(namespace: string) {
    this.encapsulatedObject.namespace = namespace;
  }

  public get realm(): Realm {
    return this.encapsulatedObject.realm;
  }

  public set realm(realm: Realm) {
    this.encapsulatedObject.realm = realm;
  }

  public get shard(): Shard {
    return this.encapsulatedObject.shard;
  }

  public set shard(shard: Shard) {
    this.encapsulatedObject.shard = shard;
  }

  public get clusters(): FacadeArray<StringFacade, string> {
    return this.clusterList;
  }
}
