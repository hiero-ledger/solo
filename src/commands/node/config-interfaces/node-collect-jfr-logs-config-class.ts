// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type DeploymentName} from '../../../types/index.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeCollectJfrLogsConfigClass {
  namespace: NamespaceName;
  deployment: DeploymentName;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  nodeAlias: NodeAlias;
}
