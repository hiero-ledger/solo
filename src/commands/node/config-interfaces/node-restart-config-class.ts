// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type NodeAliases} from '../../../types/aliases.js';

export interface NodeRestartConfigClass {
  namespace: NamespaceName;
  deployment: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  nodeAliases: NodeAliases;
}
