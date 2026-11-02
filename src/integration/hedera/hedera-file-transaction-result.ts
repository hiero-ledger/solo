// SPDX-License-Identifier: Apache-2.0

import {type FileId} from '@hiero-ledger/sdk';
import {type HederaTransactionStatus} from './hedera-transaction-status.js';

export interface HederaFileTransactionResult extends HederaTransactionStatus {
  /** the id of the created file, only set by a file create */
  fileId?: FileId;
}
