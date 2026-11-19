// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type PrivateKey, type PublicKey, type ServiceEndpoint} from '@hiero-ledger/sdk';

export interface HederaNodeCreateOptions {
  /** the account of the new node */
  accountId: AccountId | string;

  gossipEndpoints: ServiceEndpoint[];

  serviceEndpoints: ServiceEndpoint[];

  /** the gossip signing (CA) certificate */
  gossipCaCertificate: Uint8Array;

  /** the hash of the TLS certificate */
  certificateHash: Uint8Array;

  /** the admin key of the new node */
  adminKey: PublicKey;

  /** the keys that sign the transaction, in signing order, in addition to the operator */
  signingKeys: PrivateKey[];
}
