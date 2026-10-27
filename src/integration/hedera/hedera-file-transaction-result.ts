// SPDX-License-Identifier: Apache-2.0

import {type FileId} from '@hiero-ledger/sdk';

export interface HederaFileTransactionResult {
  /** whether the receipt status is SUCCESS */
  isSuccess: boolean;

  /** the receipt status name, such as SUCCESS or INVALID_SIGNATURE */
  status: string;

  /** the id of the created file, only set by a file create */
  fileId?: FileId;
}
