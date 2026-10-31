// SPDX-License-Identifier: Apache-2.0

import {type TransactionId} from '@hiero-ledger/sdk';
import {type HederaTransactionStatus} from './hedera-transaction-status.js';

/** A transaction the network has accepted but whose outcome is not known until its receipt is read. */
export interface HederaSubmittedTransaction {
  readonly transactionId: TransactionId;

  /**
   * Waits for the receipt of the transaction
   * @param pollIntervalMs - the fixed time between receipt queries, replacing the SDK backoff
   */
  awaitReceipt(pollIntervalMs: number): Promise<HederaTransactionStatus>;
}
