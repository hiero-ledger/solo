// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {CachedItem} from '../models/impl/cached-item.js';
import {ArtifactHealthResult} from '../models/impl/artifact-health-result.js';
import {type CacheOperationHandler} from '../api/cache-operation-handler.js';
import {type ContainerEngineClient} from '../../container-engine/container-engine-client.js';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import {type CacheTargetProvider} from '../target-providers/cache-target-provider.js';
import {type CacheHealthInspector} from '../api/cache-health-inspector.js';
import {type CacheTarget} from '../models/impl/cache-target.js';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';

export class ImageCacheHandler implements CacheOperationHandler {
  public constructor(
    private readonly engine: ContainerEngineClient,
    private readonly provider: CacheTargetProvider,
    @inject(InjectTokens.CacheCatalogStore) private readonly store?: CacheCatalogStore,
    @inject(InjectTokens.CacheHealthInspector) private readonly inspector?: CacheHealthInspector,
  ) {
    this.store = patchInject(store, InjectTokens.CacheCatalogStore, this.constructor.name);
    this.inspector = patchInject(inspector, InjectTokens.CacheHealthInspector, this.constructor.name);
  }

  public getType(): CacheArtifactEnum {
    return CacheArtifactEnum.IMAGE;
  }

  public async resolveRequiredArtifacts(): Promise<readonly CacheTarget[]> {
    const targets: readonly CacheTarget[] = await this.provider.getRequiredTargets();

    return targets.filter((target): boolean => target.type === this.getType());
  }

  public async pull(targets?: readonly CacheTarget[]): Promise<readonly CachedItem[]> {
    const results: CachedItem[] = [];

    targets ||= await this.resolveRequiredArtifacts();

    for (const target of targets) {
      const image: string = `${target.name}:${target.version}`;
      const archivePath: string = this.store.resolvePath(target);

      const archiveExists: boolean = await this.inspector.exists(archivePath);

      if (!archiveExists) {
        await this.engine.pullImage(image);
        await this.engine.saveImage(image, archivePath);
      }

      results.push(new CachedItem(target, archivePath, new Date().toISOString()));
    }

    return results;
  }

  public async load(items: readonly CachedItem[], target?: string): Promise<void> {
    for (const item of items) {
      await this.engine.loadImage(item.localPath);

      const image: string = `${item.target.name}:${item.target.version}`;

      await this.engine.loadImageIntoCluster(image, target);
    }
  }

  public async clear(items: readonly CachedItem[]): Promise<void> {
    for (const item of items) {
      const image: string = `${item.target.name}:${item.target.version}`;

      await this.engine.removeImage(image);
      await fs.rm(item.localPath, {force: true});
    }
  }

  public async healthcheck(items: readonly CachedItem[]): Promise<readonly ArtifactHealthResult[]> {
    const results: ArtifactHealthResult[] = [];

    for (const item of items) {
      const exists: boolean = await this.inspector.exists(item.localPath);

      results.push(
        new ArtifactHealthResult(item.target, exists, exists ? 'image archive exists' : 'image archive missing'),
      );
    }

    return results;
  }
}
