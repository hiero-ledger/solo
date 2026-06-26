// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type NodeServiceMapping} from '../../../types/mappings/node-service-mapping.js';
import {type NodeCommonConfigClass} from './node-common-config-class.js';

export interface CheckedNodesConfigClass extends NodeCommonConfigClass {
  podRefs: Record<NodeAlias, PodReference>;
  skipStop: boolean;
  existingNodeAliases: NodeAliases;
  allNodeAliases: NodeAliases;
  serviceMap: NodeServiceMapping;
}
