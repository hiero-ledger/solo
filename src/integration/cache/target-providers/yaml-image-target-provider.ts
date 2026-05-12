// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {parse} from 'yaml';
import {CacheTarget} from '../models/impl/cache-target.js';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type CacheTargetProvider} from './cache-target-provider.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';

type ImageTargetsFile = {
  images?: Array<{
    name: string;
    source?: string;
    version: string;
  }>;
};

/**
 * YAML-backed provider for container image cache targets.
 *
 * Expected YAML shape:
 *
 * ```yaml
 * images:
 *   - name: ghcr.io/my-org/my-service
 *     source: ghcr.io
 *     version: 1.2.3
 * ```
 */
export class YamlImageTargetProvider implements CacheTargetProvider {
  public constructor(private readonly filePath: string) {}

  public async getRequiredTargets(): Promise<readonly CacheTargetStructure[]> {
    const raw: string = await fs.readFile(this.filePath, 'utf8');
    const parsed: ImageTargetsFile = parse(raw) as ImageTargetsFile;

    return (parsed.images ?? []).map((image): CacheTargetStructure => {
      return new CacheTarget(CacheArtifactEnum.IMAGE, image.name, image.version, image.source);
    });
  }
}
