// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type AnyObject} from '../../types/aliases.js';

export interface OneShotSingleDeployConfigClass {
  relayNodeConfiguration: AnyObject;
  explorerNodeConfiguration: AnyObject;
  blockNodeConfiguration: AnyObject;
  mirrorNodeConfiguration: AnyObject;
  consensusNodeConfiguration: AnyObject;
  networkConfiguration: AnyObject;
  setupConfiguration: AnyObject;
  valuesFile: string;
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
  cacheDir: string;
  predefinedAccounts: boolean;
  minimalSetup: boolean;
}
