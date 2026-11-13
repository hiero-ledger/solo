// SPDX-License-Identifier: Apache-2.0

import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type HederaClient} from '../../../integration/hedera/hedera-client.js';
import {type NodeAlias} from '../../../types/aliases.js';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';

export interface NodePrepareUpgradeConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  cacheDir: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: HederaClient;
  skipNodeAlias: NodeAlias;

  // Post-upgrade system file flags
  simpleFeesSchedulesFile: string;
  throttlesFile: string;
}
