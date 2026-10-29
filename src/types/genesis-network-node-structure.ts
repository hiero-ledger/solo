// SPDX-License-Identifier: Apache-2.0

import {type NodeAccountId} from './node-account-id.js';
import {type ProtobufEd25519Key} from './protobuf-ed25519-key.js';
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
  adminKey: ProtobufEd25519Key;
}
