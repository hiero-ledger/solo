// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import path from 'node:path';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {CachedItem} from '../models/impl/cached-item.js';
import {ArtifactHealthResult} from '../models/impl/artifact-health-result.js';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import {type CacheTargetProvider} from '../target-providers/cache-target-provider.js';
import {type CacheHealthInspector} from '../api/cache-health-inspector.js';
import {type HelmClient} from '../../helm/helm-client.js';
import {Chart} from '../../helm/model/chart.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {CacheTarget} from '../models/impl/cache-target.js';

@injectable()
// export class HelmChartCacheHandler implements CacheOperationHandler {
export class HelmChartCacheHandler {
  public constructor(
    private readonly store: CacheCatalogStore,
    private readonly provider: CacheTargetProvider,
    private readonly inspector: CacheHealthInspector,
    @inject(InjectTokens.Helm) private readonly helm?: HelmClient,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
  }

  public getType(): CacheArtifactEnum {
    return CacheArtifactEnum.HELM_CHART;
  }

  public async resolveRequiredArtifacts(): Promise<readonly CacheTarget[]> {
    const targets: readonly CacheTarget[] = await this.provider.getRequiredTargets();
    return targets.filter((target): boolean => target.type === this.getType());
  }

  public async pull(targets: readonly CacheTarget[]): Promise<readonly CachedItem[]> {
    const results: CachedItem[] = [];

    for (const target of targets) {
      const localPath: string = this.store.resolvePath(target, CacheArtifactEnum.IMAGE);
      const destinationDirectory: string = path.dirname(localPath);

      await fs.mkdir(destinationDirectory, {recursive: true});

      await this.helm.pullChartPackage(new Chart(target.name, target.source), target.version, destinationDirectory);

      results.push(new CachedItem(target, localPath, new Date().toISOString()));
    }

    return results;
  }

  public async load(_items: readonly CachedItem[], _target?: string): Promise<void> {
    return;
  }

  public async clear(items: readonly CachedItem[]): Promise<void> {
    for (const item of items) {
      await fs.rm(item.localPath, {force: true});
    }
  }

  public async healthcheck(items: readonly CachedItem[]): Promise<readonly ArtifactHealthResult[]> {
    const results: ArtifactHealthResult[] = [];

    for (const item of items) {
      const exists: boolean = await this.inspector.exists(item.localPath);

      results.push(
        new ArtifactHealthResult(item.target, exists, exists ? 'chart archive exists' : 'chart archive missing'),
      );
    }

    return results;
  }
}
