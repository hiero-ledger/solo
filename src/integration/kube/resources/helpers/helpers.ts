// SPDX-License-Identifier: Apache-2.0

import {type Container} from '../container/container.js';
import {type NodeAlias} from '../../../../types/aliases.js';
import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';

export interface Helpers {
  getConsensusNodeRootContainer(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<Container>;
}
