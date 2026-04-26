// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetStructure} from '../cache-target-structure.js';
import {type CacheArtifactEnum} from '../../enums/cache-artifact-enum.js';

export class CacheTarget implements CacheTargetStructure {
  public constructor(
    public readonly type: CacheArtifactEnum,
    public readonly name: string,
    public readonly version: string,
    public readonly source?: string,
  ) {}
}
