// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetProvider} from './cache-target-provider.js';
import {type CacheTarget} from '../models/impl/cache-target.js';

export class StaticCacheTargetProvider implements CacheTargetProvider {
  public constructor(private readonly targets: readonly CacheTarget[]) {}

  public async getRequiredTargets(): Promise<readonly CacheTarget[]> {
    return this.targets;
  }
}
