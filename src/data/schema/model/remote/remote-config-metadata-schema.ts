// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {UserIdentitySchema} from '../common/user-identity-schema.js';

@Exclude()
export class RemoteConfigMetadataSchema {
  @Expose()
  public lastUpdatedAt: Date;

  @Expose()
  @Type((): typeof UserIdentitySchema => UserIdentitySchema)
  public lastUpdatedBy: UserIdentitySchema;

  public constructor(lastUpdatedAt?: Date, lastUpdatedBy?: UserIdentitySchema) {
    if (lastUpdatedAt) {
      this.lastUpdatedAt = lastUpdatedAt;
    }
    if (lastUpdatedBy) {
      this.lastUpdatedBy = lastUpdatedBy;
    }
  }
}
