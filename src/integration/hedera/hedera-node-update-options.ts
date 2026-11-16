// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type PrivateKey, type PublicKey, type ServiceEndpoint} from '@hiero-ledger/sdk';

export interface HederaNodeUpdateOptions {
  /** the id of the node to update */
  nodeId: number;

  /** the new admin key of the node */
  adminKey?: PublicKey;

  /** the new account of the node */
  accountId?: AccountId | string;

  gossipEndpoints?: ServiceEndpoint[];

  serviceEndpoints?: ServiceEndpoint[];

  grpcWebProxyEndpoint?: ServiceEndpoint;

  /** the hash of the new TLS certificate */
  certificateHash?: Uint8Array;

  /** the new gossip signing (CA) certificate */
  gossipCaCertificate?: Uint8Array;

  /** the keys that sign the transaction, in signing order, in addition to the operator */
  signingKeys: PrivateKey[];
}
