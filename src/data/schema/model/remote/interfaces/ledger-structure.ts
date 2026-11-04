// SPDX-License-Identifier: Apache-2.0

import {type LedgerPhase} from '../ledger-phase.js';

export interface LedgerStructure {
  phase: LedgerPhase;
  realm: number;
  shard: number;
}
