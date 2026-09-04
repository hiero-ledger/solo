// SPDX-License-Identifier: Apache-2.0

import {type CachedItemStructure} from '../cached-item-structure.js';
import {type CacheTargetStructure} from '../cache-target-structure.js';

export class CachedItem implements CachedItemStructure {
  public constructor(
    public readonly target: CacheTargetStructure,
    public readonly localPath: string,
    public readonly cachedAt: string,
  ) {}
}
