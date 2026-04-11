// SPDX-License-Identifier: Apache-2.0

import {parse} from 'yaml';
import fs from 'node:fs/promises';
import {CacheTarget} from '../models/impl/cache-target.js';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type CacheTargetProvider} from './cache-target-provider.js';

type HelmChartTargetsFile = {
  charts?: Array<{
    name: string;
    source: string;
    version: string;
  }>;
};

/**
 * YAML-backed provider for Helm chart cache targets.
 *
 * This provider is intended to be instantiated directly with the path to a YAML file
 * containing Helm chart target definitions.
 *
 * Expected YAML shape:
 *
 * ```yaml
 * charts:
 *   - name: cert-manager
 *     source: jetstack
 *     version: v1.17.1
 * ```
 */
export class YamlHelmChartTargetProvider implements CacheTargetProvider {
  public constructor(private readonly filePath: string) {}

  public async getRequiredTargets(): Promise<readonly CacheTarget[]> {
    const raw: string = await fs.readFile(this.filePath, 'utf8');
    const parsed: HelmChartTargetsFile = parse(raw) as HelmChartTargetsFile;

    return (parsed.charts ?? []).map((chart): CacheTarget => {
      return new CacheTarget(CacheArtifactEnum.HELM_CHART, chart.name, chart.version, chart.source);
    });
  }
}
