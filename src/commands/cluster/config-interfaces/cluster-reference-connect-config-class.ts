// SPDX-License-Identifier: Apache-2.0

import {type ClusterReference} from '../../../types/index.js';
import {type UserIdentity} from '../../../data/schema/model/common/user-identity.js';

export interface ClusterReferenceConnectConfigClass {
  cacheDir: string;
  devMode: boolean;
  quiet: boolean;
  userIdentity: UserIdentity;
  clusterRef: ClusterReference;
  context: string;
}
