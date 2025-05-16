// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {UserIdentitySchema} from '../common/user-identity-schema.js';

@Exclude()
export class RemoteConfigMetadataSchema {
  @Expose()
  public lastUpdatedAt: Date;

  @Expose()
  @Type(() => UserIdentitySchema)
  public lastUpdatedBy: UserIdentitySchema;
}
