// SPDX-License-Identifier: Apache-2.0

import {type Version} from '../../../../types/index.js';
import {type UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';

export interface MigrationStruct {
  migratedAt: Date;
  migratedBy: UserIdentitySchema;
  fromVersion: Version;
}
