// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';

export class UserIdentity implements Facade<UserIdentitySchema> {
  public constructor(public readonly encapsulatedObject: UserIdentitySchema) {}

  public get name(): string {
    return this.encapsulatedObject.name;
  }

  public set name(name: string) {
    this.encapsulatedObject.name = name;
  }

  public get hostname(): string {
    return this.encapsulatedObject.hostname;
  }

  public set hostname(hostname: string) {
    this.encapsulatedObject.hostname = hostname;
  }
}
