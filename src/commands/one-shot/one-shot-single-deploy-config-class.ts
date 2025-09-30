// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject} from '../../types/aliases.js';

export interface OneShotSingleDeployConfigClass {
  valuesFile: string;
  relayNode: AnyObject;
  explorerNode: AnyObject;
  blockNode: AnyObject;
  mirrorNode: AnyObject;
  consensusNode: AnyObject;
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
  cacheDir: string;
  predefinedAccounts: boolean;
}
