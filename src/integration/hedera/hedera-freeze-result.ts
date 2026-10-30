// SPDX-License-Identifier: Apache-2.0

import {type HederaTransactionStatus} from './hedera-transaction-status.js';

export interface HederaFreezeResult extends HederaTransactionStatus {
  /** the id of the freeze transaction */
  transactionId: string;
}
