// SPDX-License-Identifier: Apache-2.0

import {
  type Client,
  Status,
  type TransactionId,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {type HederaSubmittedTransaction} from '../hedera-submitted-transaction.js';
import {type HederaTransactionStatus} from '../hedera-transaction-status.js';

/** A {@link HederaSubmittedTransaction} backed by a Hedera SDK transaction response. */
export class SdkHederaSubmittedTransaction implements HederaSubmittedTransaction {
  public constructor(
    private readonly response: TransactionResponse,
    private readonly sdkClient: Client,
  ) {}

  public get transactionId(): TransactionId {
    return this.response.transactionId;
  }

  public async awaitReceipt(pollIntervalMs: number): Promise<HederaTransactionStatus> {
    const receipt: TransactionReceipt = await this.response
      .getReceiptQuery(this.sdkClient)
      .setMaxBackoff(pollIntervalMs)
      .setMinBackoff(pollIntervalMs)
      .execute(this.sdkClient);

    return {isSuccess: receipt.status === Status.Success, status: receipt.status.toString()};
  }
}
