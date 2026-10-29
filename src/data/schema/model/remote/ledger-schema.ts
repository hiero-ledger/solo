// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {type LedgerPhase} from './ledger-phase.js';
import {Transformations} from '../utils/transformations.js';
import {type LedgerStructure} from './interfaces/ledger-structure.js';

@Exclude()
export class LedgerSchema implements LedgerStructure {
  @Expose()
  @Transform(Transformations.LedgerPhase)
  public phase: LedgerPhase;

  @Expose()
  public realm: number;

  @Expose()
  public shard: number;

  public constructor(phase?: LedgerPhase, realm?: number, shard?: number) {
    this.phase = phase;
    this.realm = realm ?? 0;
    this.shard = shard ?? 0;
  }
}
