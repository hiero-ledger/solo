// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject} from '../../types/aliases.js';

export interface OneShotSingleDeployConfigClass {
  relayNodeCfg: AnyObject;
  explorerNodeCfg: AnyObject;
  blockNodeCfg: AnyObject;
  mirrorNodeCfg: AnyObject;
  consensusNodeCfg: AnyObject;
  networkCfg: AnyObject;
  setupCfg: AnyObject;
  valuesFile: string;
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
  cacheDir: string;
  predefinedAccounts: boolean;
}
