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
import {type CacheTargetProvider} from '../target-providers/cache-target-provider.js';
import {type CacheHealthInspector} from '../api/cache-health-inspector.js';
import {type CacheTarget} from '../models/impl/cache-target.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyListrContext} from '../../../types/aliases.js';
import chalk from 'chalk';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {type FileSystemCacheCatalogStore} from './file-system-cache-catalog-store.js';

export class ImageCacheHandler implements CacheOperationHandler {
  public constructor(
    private readonly engine: ContainerEngineClient,
    private readonly provider: CacheTargetProvider,
    @inject(InjectTokens.FileSystemCacheCatalogStore) public readonly store?: FileSystemCacheCatalogStore,
    @inject(InjectTokens.CacheHealthInspector) private readonly inspector?: CacheHealthInspector,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.store = patchInject(store, InjectTokens.FileSystemCacheCatalogStore, this.constructor.name);
    this.inspector = patchInject(inspector, InjectTokens.CacheHealthInspector, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
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
      const localPath: string = this.store.resolvePath(target, CacheArtifactEnum.IMAGE);
      return new CachedItem(target, localPath, now);
    });
  }

  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();

    for (const target of targets) {
      subTasks.push({
        title: `Caching ${target.name}:${target.version}`,
        task: async ({config}, task): Promise<void> => {
          const image: string = `${target.name}:${target.version}`;
          const archivePath: string = this.store.resolvePath(target, CacheArtifactEnum.IMAGE);

          const archiveExists: boolean = await this.inspector.exists(archivePath);

          if (!archiveExists) {
            try {
              await this.engine.pullImage(image);
            } catch (error) {
              task.title += ' - ' + chalk.red(`failed to PULL image: ${image}`);
              this.logger.error('Failed to pull image:', error);
              return;
            }

            try {
              await this.engine.saveImage(image, archivePath);
            } catch (error) {
              task.title += ' - ' + chalk.red(`failed to SAVE image: ${image}`);
              this.logger.error('Failed to save image archive:', error);
              return;
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
      const name: string = `${item.target.name}:${item.target.version}`;

      subTasks.push({
        title: `Loading ${name} into ${target}`,
        task: async (): Promise<void> => {
          const exists: boolean = await this.inspector.exists(item.localPath);

          if (!exists) {
            return;
          }

          try {
            await this.engine.loadImageArchiveIntoCluster(item.localPath, target);
          } catch (error) {
            this.logger.showUser(`Failed to load image archive into cluster: ${name}`);
            this.logger.error(error);
            console.error(error);
          }
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
    const results: ArtifactHealthResult[] = [];

    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      const exists: boolean = await this.inspector.exists(item.localPath);
      const message: string = exists ? 'image archive exists' : 'image archive missing';

      results.push(new ArtifactHealthResult(item.target, exists, message));
    }

    return results;
  }

  public async list(): Promise<readonly CachedItem[]> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();
    const existingItems: CachedItem[] = [];

    for (const item of items) {
      if (await this.inspector.exists(item.localPath)) {
        existingItems.push(item);
      }
    }

    return existingItems;
  }
}
