// SPDX-License-Identifier: Apache-2.0

import {type NodeDestroyConfigClass} from './node-destroy-config-class.js';

export interface NodeDestroyContext {
  config: NodeDestroyConfigClass;
  upgradeZipHash: string;
}
