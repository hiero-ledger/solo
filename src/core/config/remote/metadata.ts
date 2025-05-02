// SPDX-License-Identifier: Apache-2.0

import {type ToObject} from '../../../types/index.js';
import {type RemoteConfigMetadataStruct} from './interfaces/remote-config-metadata-struct.js';
import {type UserIdentity} from '../../../data/schema/model/common/user-identity.js';

export class RemoteConfigMetadata implements RemoteConfigMetadataStruct, ToObject<RemoteConfigMetadataStruct> {
  public constructor(
    public lastUpdatedAt: Date,
    public lastUpdatedBy: UserIdentity,
  ) {}

  public static fromObject(metadata: RemoteConfigMetadataStruct): RemoteConfigMetadata {
    return new RemoteConfigMetadata(metadata.lastUpdatedAt, metadata.lastUpdatedBy);
  }

  public toObject(): RemoteConfigMetadataStruct {
    return {lastUpdatedAt: this.lastUpdatedAt, lastUpdatedBy: this.lastUpdatedBy};
  }
}
