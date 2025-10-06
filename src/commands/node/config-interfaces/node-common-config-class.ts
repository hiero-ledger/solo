// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type NodeServiceMapping} from '../../../types/mappings/node-service-mapping.js';

export interface NodeCommonConfigClass {
  namespace: NamespaceName;
  deployment: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  quiet: boolean;
  keysDir: string;
  stagingDir: string;
  nodeAliases: NodeAliases;
}

export interface NodeCommonContext {
  config: NodeCommonConfigClass;
}

export interface NodeCommonConfigWithNodeAliases extends NodeCommonConfigClass {
  nodeAliases: NodeAliases;
  nodeAliasesUnparsed: string;
}

export interface NodeCommonConfigWithNodeAlias extends NodeCommonConfigClass {
  nodeAlias: NodeAlias;
}

export interface CheckedNodesConfigClass extends NodeCommonConfigClass {
  podRefs: Record<NodeAlias, PodReference>;
  skipStop: boolean;
  existingNodeAliases: NodeAliases;
  allNodeAliases: NodeAliases;
  serviceMap: NodeServiceMapping;
}

export interface CheckedNodesContext {
  config: CheckedNodesConfigClass;
}
