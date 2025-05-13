// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';

export class UserIdentity implements Facade<UserIdentitySchema> {
  public constructor(public readonly backingObject: UserIdentitySchema) {}

  public get name(): string {
    return this.backingObject.name;
  }

  public set name(name: string) {
    this.backingObject.name = name;
  }

  public get hostname(): string {
    return this.backingObject.hostname;
  }

  public set hostname(hostname: string) {
    this.backingObject.hostname = hostname;
  }
}
