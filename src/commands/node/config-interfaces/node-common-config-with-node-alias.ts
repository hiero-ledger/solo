// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type NodeCommonConfigClass} from './node-common-config-class.js';

export interface NodeCommonConfigWithNodeAlias extends NodeCommonConfigClass {
  nodeAlias: NodeAlias;
}
