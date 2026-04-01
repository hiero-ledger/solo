// SPDX-License-Identifier: Apache-2.0

import {type CacheStatusStructure} from '../cache-status-structure.js';
import {type CacheTargetStructure} from '../cache-target-structure.js';

export class CacheStatus implements CacheStatusStructure {
  public constructor(
    public readonly healthy: boolean,
    public readonly totalItems: number,
    public readonly totalSizeBytes: number,
    public readonly missingTargets: readonly CacheTargetStructure[],
  ) {}
}
