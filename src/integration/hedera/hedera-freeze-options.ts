// SPDX-License-Identifier: Apache-2.0

import {type FileId} from '@hiero-ledger/sdk';
import {type HederaFreezeType} from './hedera-freeze-type.js';

export interface HederaFreezeOptions {
  type: HederaFreezeType;

  /** when the freeze starts, used by freeze-upgrade and freeze-only */
  startTime?: Date;

  /** the file that holds the upgrade, used by prepare-upgrade and freeze-upgrade */
  fileId?: FileId;

  /** the hash of the upgrade file, used by prepare-upgrade and freeze-upgrade */
  fileHash?: string;
}
