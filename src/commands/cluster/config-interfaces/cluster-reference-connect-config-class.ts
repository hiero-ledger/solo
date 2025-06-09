// SPDX-License-Identifier: Apache-2.0

import {type ClusterReference} from '../../../types/index.js';
import {type UserIdentitySchema} from '../../../data/schema/model/common/user-identity-schema.js';

export interface ClusterReferenceConnectConfigClass {
  cacheDir: string;
  devMode: boolean;
  quiet: boolean;
  userIdentity: UserIdentitySchema;
  clusterRef: ClusterReference;
  context: string;
}
