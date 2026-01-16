// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../pod/pod.js';
import {type Container} from '../container/container.js';
import {type NodeAlias} from '../../../../types/aliases.js';
import {type PodReference} from '../pod/pod-reference.js';
import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';

export interface Helpers {
  getConsensusNodeRootContainer(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Container>;

  getConsensusNodePod(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Pod>;

  getConsensusNodePodReference(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<PodReference>;
}
