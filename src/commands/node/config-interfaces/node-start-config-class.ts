// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';
import {type Optional} from '../../../types/index.js';

export interface NodeStartConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  stagingDir: string;
  forcePortForward: Optional<boolean>;
}
