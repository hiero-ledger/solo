// SPDX-License-Identifier: Apache-2.0

interface MirrorTransaction {
  transaction_id?: string;
  consensus_timestamp?: string;
}

export interface MirrorTransactionResponse {
  transactions?: MirrorTransaction[];
}
