// SPDX-License-Identifier: Apache-2.0

import {type Version} from '../types.js';
import {type UserIdentity} from '../../../../data/schema/model/common/user-identity.js';

export interface MigrationStruct {
  migratedAt: Date;
  migratedBy: UserIdentity;
  fromVersion: Version;
}
