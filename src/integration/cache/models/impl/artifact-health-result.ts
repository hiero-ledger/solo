// SPDX-License-Identifier: Apache-2.0

import {type ArtifactHealthResultStructure} from '../artifact-health-result-structure.js';
import {type CacheTargetStructure} from '../cache-target-structure.js';

export class ArtifactHealthResult implements ArtifactHealthResultStructure {
  public constructor(
    public readonly target: CacheTargetStructure,
    public readonly healthy: boolean,
    public readonly message?: string,
  ) {}
}
