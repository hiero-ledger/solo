// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterReferenceName, type DeploymentName} from '../types/index.js';
import {type NodeAliases} from '../types/aliases.js';
import {type LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';

interface DeploymentAddClusterConfig {
  quiet: boolean;
  context: string;
  namespace: NamespaceName;
  deployment: DeploymentName;
  clusterRef: ClusterReferenceName;

  enableCertManager: boolean;
  numberOfConsensusNodes: number;
  dnsBaseDomain: string;
  dnsConsensusNodePattern: string;

  ledgerPhase?: LedgerPhase;
  nodeAliases: NodeAliases;

  existingNodesCount: number;
  existingClusterContext?: string;
}

export interface DeploymentAddClusterContext {
  config: DeploymentAddClusterConfig;
}
