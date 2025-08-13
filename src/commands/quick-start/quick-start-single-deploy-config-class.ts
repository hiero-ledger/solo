// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';

export interface QuickStartSingleDeployConfigClass {
  clusterRef: string;
  context: string;
  deployment: string;
  namespace: NamespaceName;
  numberOfConsensusNodes: number;
  cacheDir: string;
  predefinedAccounts: boolean;
}
