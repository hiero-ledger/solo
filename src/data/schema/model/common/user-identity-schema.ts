// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import os from 'node:os';

@Exclude()
export class UserIdentitySchema {
  @Expose()
  public name: string;

  @Expose()
  public hostname: string;

  public constructor(name?: string, hostname?: string) {
    this.name = name ?? os.userInfo().username;
    this.hostname = hostname ?? os.hostname();
  }
}
