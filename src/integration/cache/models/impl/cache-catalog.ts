// SPDX-License-Identifier: Apache-2.0

import {type CacheCatalogStructure} from '../cache-catalog-structure.js';
import {type CachedItemStructure} from '../cached-item-structure.js';

export class CacheCatalog implements CacheCatalogStructure {
  public constructor(
    public readonly version: string,
    public readonly soloVersion: string,
    public readonly items: readonly CachedItemStructure[],
  ) {}
}
