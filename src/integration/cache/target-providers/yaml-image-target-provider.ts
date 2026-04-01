// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {parse} from 'yaml';
import {CacheTarget} from '../models/impl/cache-target.js';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type CacheTargetProvider} from './cache-target-provider.js';

type ImageTargetsFile = {
  images?: Array<{
    name: string;
    source?: string;
  }>;
};

/**
 * YAML-backed provider for container image cache targets.
 *
 * This provider is intended to be instantiated directly with the path to a YAML file
 * containing image target definitions, and then supplied anywhere a
 * {@link CacheTargetProvider} is required.
 *
 * Expected YAML shape:
 *
 * ```yaml
 * images:
 *   - name: ghcr.io/my-org/my-service:1.2.3
 *     source: ghcr.io
 * ```
 */
export class YamlImageTargetProvider implements CacheTargetProvider {
  public constructor(private readonly filePath: string) {}

  public async getRequiredTargets(): Promise<readonly CacheTarget[]> {
    const raw: string = await fs.readFile(this.filePath, 'utf8');
    const parsed: ImageTargetsFile = parse(raw) as ImageTargetsFile;

    return (parsed.images ?? []).map((image): CacheTarget => {
      return new CacheTarget(
        CacheArtifactEnum.IMAGE, // or your actual image enum constant
        image.name,
        image.source,
      );
    });
  }
}
