// SPDX-License-Identifier: Apache-2.0

import {type NodeAliases} from '../../../types/aliases.js';
import {type NodeCommonConfigClass} from './node-common-config-class.js';

export interface NodeCommonConfigWithNodeAliases extends NodeCommonConfigClass {
  nodeAliases: NodeAliases;
  nodeAliasesUnparsed: string;
}
