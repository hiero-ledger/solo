// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
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
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyListrContext} from '../../../types/aliases.js';

export class ImageCacheHandler implements CacheOperationHandler {
  public constructor(
    private readonly engine: ContainerEngineClient,
    private readonly provider: CacheTargetProvider,
    @inject(InjectTokens.FileSystemCacheCatalogStore) private readonly store?: CacheCatalogStore,
    @inject(InjectTokens.CacheHealthInspector) private readonly inspector?: CacheHealthInspector,
  ) {
    this.store = patchInject(store, InjectTokens.FileSystemCacheCatalogStore, this.constructor.name);
    this.inspector = patchInject(inspector, InjectTokens.CacheHealthInspector, this.constructor.name);
  }

  public getType(): CacheArtifactEnum {
    return CacheArtifactEnum.IMAGE;
  }

  public async resolveRequiredArtifacts(): Promise<readonly CacheTarget[]> {
    const targets: readonly CacheTarget[] = await this.provider.getRequiredTargets();
    return targets.filter((target): boolean => target.type === this.getType());
  }

  private async resolveExpectedCachedItems(): Promise<readonly CachedItem[]> {
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();
    const now: string = new Date().toISOString();

    return targets.map((target): CachedItem => {
      const localPath: string = this.store.resolvePath(target);
      return new CachedItem(target, localPath, now);
    });
  }

  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();

    for (const target of targets) {
      subTasks.push({
        title: `Caching ${target.name}:${target.version}`,
        task: async ({config}): Promise<void> => {
          const image: string = `${target.name}:${target.version}`;
          const archivePath: string = this.store.resolvePath(target);

          const archiveExists: boolean = await this.inspector.exists(archivePath);

          if (!archiveExists) {
            try {
              await this.engine.pullImage(image);
            } catch (error) {
              config.imagePullErrors ||= [];
              config.imagePullErrors.push({image, error});
              console.log('-----------------------------------');
              console.log('Error pulling image:', image);
              console.log('-----------------------------------');
            }

            try {
              await this.engine.saveImage(image, archivePath);
            } catch (error) {
              config.imageSaveErrors ||= [];
              config.imageSaveErrors.push({image, error});
              console.log('-----------------------------------');
              console.log('Error saving image:', image);
              console.log('-----------------------------------');
            }
          }

          config.results.push(new CachedItem(target, archivePath, new Date().toISOString()));
        },
      });
    }

    return subTasks;
  }

  public async load(target: string): Promise<SoloListrTask<AnyListrContext>[]> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      subTasks.push({
        title: `Loading ${item.target.name}:${item.target.version} into ${target}`,
        task: async (): Promise<void> => {
          const exists: boolean = await this.inspector.exists(item.localPath);

          if (!exists) {
            return;
          }

          console.log(`Loading ${item.target.name}:${item.target.version} into ${target}`);
          await this.engine.loadImageArchiveIntoCluster(item.localPath, target);
        },
      });
    }

    return subTasks;
  }

  public async clear(): Promise<void> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      const image: string = `${item.target.name}:${item.target.version}`;

      await this.engine.removeImage(image);
      await fs.rm(item.localPath, {force: true});
    }
  }

  public async healthcheck(): Promise<readonly ArtifactHealthResult[]> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();
    const results: ArtifactHealthResult[] = [];

    for (const item of items) {
      const exists: boolean = await this.inspector.exists(item.localPath);
      const message: string = exists ? 'image archive exists' : 'image archive missing';

      results.push(new ArtifactHealthResult(item.target, exists, message));
    }

    return results;
  }
}
