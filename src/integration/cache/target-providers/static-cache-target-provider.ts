// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetProvider} from './cache-target-provider.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';

export class StaticCacheTargetProvider implements CacheTargetProvider {
  public constructor(private readonly targets: readonly CacheTargetStructure[]) {}

  public async getRequiredTargets(): Promise<readonly CacheTargetStructure[]> {
    return this.targets;
  }
}
