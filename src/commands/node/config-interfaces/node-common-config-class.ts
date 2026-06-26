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
