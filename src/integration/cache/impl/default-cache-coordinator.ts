// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {CacheCatalog} from '../models/impl/cache-catalog.js';
import {CacheStatus} from '../models/impl/cache-status.js';
import {type CacheCoordinator} from '../api/cache-coordinator.js';
import {type CacheHandlerRegistry} from '../api/cache-handler-registry.js';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import {type CacheStatusStructure} from '../models/cache-status-structure.js';
import {type CachedItemStructure} from '../models/cached-item-structure.js';
import {type ArtifactHealthResultStructure} from '../models/artifact-health-result-structure.js';
import {type CacheOperationHandler} from '../api/cache-operation-handler.js';
import {type CacheCatalogStructure} from '../models/cache-catalog-structure.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';

@injectable()
export class DefaultCacheCoordinator implements CacheCoordinator {
  public constructor(
    @inject(InjectTokens.CacheHandlerRegistry) private readonly registry: CacheHandlerRegistry,
    @inject(InjectTokens.CacheCatalogStore) private readonly store: CacheCatalogStore,
  ) {
    this.registry = patchInject(registry, InjectTokens.CacheHandlerRegistry, this.constructor.name);
    this.store = patchInject(store, InjectTokens.CacheCatalogStore, this.constructor.name);
  }

  public async pull(): Promise<void> {
    const handlers: readonly CacheOperationHandler[] = this.registry.getAllHandlers();

    const allItems: CachedItemStructure[] = [];

    for (const handler of handlers) {
      const targets: readonly CacheTargetStructure[] = await handler.resolveRequiredArtifacts();
      const items: readonly CachedItemStructure[] = await handler.pull(targets);

      allItems.push(...items);
    }

    await this.store.save(new CacheCatalog('1', 'dev', allItems));
  }

  public async list(): Promise<readonly CachedItemStructure[]> {
    const catalog: CacheCatalogStructure = await this.store.load();
    return catalog.items;
  }

  public async clear(): Promise<void> {
    const catalog: CacheCatalogStructure = await this.store.load();

    const handlers: readonly CacheOperationHandler[] = this.registry.getAllHandlers();

    for (const handler of handlers) {
      const items: CachedItemStructure[] = catalog.items.filter(
        (item): boolean => item.target.type === handler.getType(),
      );

      await handler.clear(items);
    }

    await this.store.clear();
  }

  public async status(): Promise<CacheStatusStructure> {
    const catalog: CacheCatalogStructure = await this.store.load();

    const handlers: readonly CacheOperationHandler[] = this.registry.getAllHandlers();

    const totalSizeBytes: number = 0;
    const missingTargets: CacheTargetStructure[] = [];

    for (const handler of handlers) {
      const items: CachedItemStructure[] = catalog.items.filter(
        (item): boolean => item.target.type === handler.getType(),
      );

      const results: readonly ArtifactHealthResultStructure[] = await handler.healthcheck(items);

      for (const result of results) {
        if (!result.healthy) {
          missingTargets.push(result.target);
        }
      }
    }

    return new CacheStatus(missingTargets.length === 0, catalog.items.length, totalSizeBytes, missingTargets);
  }
}
