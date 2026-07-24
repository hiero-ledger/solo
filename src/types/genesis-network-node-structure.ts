// SPDX-License-Identifier: Apache-2.0

import {type PublicKey} from '@hiero-ledger/sdk';
import {type NodeAccountId} from './node-account-id.js';
import {type ServiceEndpoint} from './service-endpoint.js';

export interface GenesisNetworkNodeStructure {
  nodeId: number;
  accountId: NodeAccountId;
  description: string;
  gossipEndpoint: ServiceEndpoint[];
  serviceEndpoint: ServiceEndpoint[];
  gossipCaCertificate: string;
  grpcCertificateHash: string;
  weight: number;
  deleted: boolean;
  adminKey: PublicKey;
}
