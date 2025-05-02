// SPDX-License-Identifier: Apache-2.0

import {type UserIdentity} from '../../../../data/schema/model/common/user-identity.js';

export interface RemoteConfigMetadataStruct {
  lastUpdatedAt: Date;
  lastUpdatedBy: UserIdentity;
}
