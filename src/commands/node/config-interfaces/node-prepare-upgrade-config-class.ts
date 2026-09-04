// SPDX-License-Identifier: Apache-2.0

import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type Client} from '@hiero-ledger/sdk';
import {type NodeAlias} from '../../../types/aliases.js';

export interface NodePrepareUpgradeConfigClass extends NodeCommonConfigWithNodeAliases {
  cacheDir: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: Client;
  skipNodeAlias: NodeAlias;
}
