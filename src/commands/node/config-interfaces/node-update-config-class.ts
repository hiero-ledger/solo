// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hiero-ledger/sdk';
import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';
import {type Client} from '@hiero-ledger/sdk';

export interface NodeUpdateConfigClass extends NodeCommonConfigWithNodeAlias, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  nodeAliases: NodeAliases;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  gossipEndpoints: string;
  gossipPrivateKey: string;
  gossipPublicKey: string;
  nodeAliasesUnparsed?: string;
  grpcEndpoints: string;
  localBuildPath: string;
  newAccountNumber: string;
  newAdminKey: PrivateKey;
  releaseTag: string;
  tlsPrivateKey: string;
  tlsPublicKey: string;
  adminKey: PrivateKey;
  chartPath: string;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: Client;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
}
