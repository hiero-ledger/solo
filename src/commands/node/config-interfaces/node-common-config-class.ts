// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeCommonConfigClass {
  namespace: NamespaceName;
  deployment: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  quiet: boolean;
  keysDir: string;
  stagingDir: string;
}

export {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
export {type NodeCommonConfigWithNodeAlias} from './node-common-config-with-node-alias.js';
export {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
export {type CheckedNodesContext} from './checked-nodes-context.js';
