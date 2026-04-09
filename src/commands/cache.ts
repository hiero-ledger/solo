// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {type ClusterReferenceName, type Context, type SoloListr, type SoloListrTask} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {ImageCacheHandlerBuilder} from '../integration/cache/impl/image-cache-handler-builder.js';
import {ImageCacheHandler} from '../integration/cache/impl/image-cache-handler.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {DockerClient} from '../integration/container-engine/docker-client.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {CachedItem} from '../integration/cache/models/impl/cached-item.js';
import {ArtifactHealthResult} from '../integration/cache/models/impl/artifact-health-result.js';
import fs from 'node:fs/promises';

interface CachePullConfigClass {
  imageCacheHandler: ImageCacheHandler;
  results: readonly CachedItem[];
}

interface CachePullContext {
  config: CachePullConfigClass;
}

interface CacheLoadConfigClass {
  imageCacheHandler: ImageCacheHandler;
  clusterReference: ClusterReferenceName;
  context: Context;
}

interface CacheLoadContext {
  config: CacheLoadConfigClass;
}

interface CacheClearConfigClass {
  imageCacheHandler: ImageCacheHandler;
}

interface CacheClearContext {
  config: CacheClearConfigClass;
}

interface CacheStatusConfigClass {
  imageCacheHandler: ImageCacheHandler;
}

interface CacheStatusContext {
  config: CacheStatusConfigClass;
}

interface CacheListConfigClass {
  imageCacheHandler: ImageCacheHandler;
}

interface CacheListContext {
  config: CacheListConfigClass;
}

@injectable()
export class CacheCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.DockerClient) private dockerClient?: DockerClient) {
    super();

    this.dockerClient = patchInject(dockerClient, InjectTokens.DockerClient, this.constructor.name);
  }

  // ------ Flags ------ //

  public static readonly PULL_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.devMode],
  };

  public static readonly LOAD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.devMode, flags.clusterRef],
  };

  public static readonly LIST_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.devMode],
  };

  public static readonly CLEAR_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.devMode],
  };

  public static readonly STATUS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.devMode],
  };

  // ----- Handlers ------- //

  public async pull(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CachePullContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            this.configManager.update(argv);

            flags.disablePrompts(CacheCommand.PULL_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.PULL_FLAGS_LIST.required,
              ...CacheCommand.PULL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = {
              imageCacheHandler: ImageCacheHandlerBuilder.fromYaml(constants.SOLO_CACHE_IMAGES_TARGET_FILE)
                .engine(this.dockerClient)
                .build(),
              results: [],
            };
          },
        },
        this.pullAndCacheContainerImages(),
        this.showUserMessages(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image pull',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error pulling cache: ${error.message}`, error);
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {});
    }

    return true;
  }

  public async load(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CacheLoadContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            flags.disablePrompts(CacheCommand.LOAD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.LOAD_FLAGS_LIST.required,
              ...CacheCommand.LOAD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const context: Context = this.getClusterContext(clusterReference);

            context_.config = {
              imageCacheHandler: ImageCacheHandlerBuilder.fromYaml(constants.SOLO_CACHE_IMAGES_TARGET_FILE)
                .engine(this.dockerClient)
                .build(),
              clusterReference,
              context,
            };
          },
        },
        this.loadImagesIntoCluster(),
        this.showUserMessages(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image load',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error loading from cache: ${error.message}`, error);
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {});
    }

    return true;
  }

  public async list(): Promise<boolean> {
    const tasks: SoloListr<CacheListContext> = this.taskList.newTaskList(
      [
        {
          title: 'List cached images',
          task: async (context_): Promise<void> => {
            const config: CacheListConfigClass = {
              imageCacheHandler: ImageCacheHandlerBuilder.fromYaml(constants.SOLO_CACHE_IMAGES_TARGET_FILE)
                .engine(this.dockerClient)
                .build(),
            };

            context_.config = config;

            const cachedItems: readonly CachedItem[] = await config.imageCacheHandler.list();

            try {
              this.logger.showList(
                `Cached images: [${cachedItems.length}]`,
                cachedItems.map((item): string => `${item.target.name}:${item.target.version}`),
              );
            } catch {
              this.logger.warn('No cache manifest found');
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image list',
    );

    await tasks.run();
    return true;
  }

  public async clear(): Promise<boolean> {
    const tasks: SoloListr<CacheClearContext> = this.taskList.newTaskList(
      [
        {
          title: 'Clear image cache',
          task: async (context_): Promise<void> => {
            const config: CacheClearConfigClass = {
              imageCacheHandler: ImageCacheHandlerBuilder.fromYaml(constants.SOLO_CACHE_IMAGES_TARGET_FILE)
                .engine(this.dockerClient)
                .build(),
            };

            context_.config = config;

            await config.imageCacheHandler.clear();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image clear',
    );

    await tasks.run();
    return true;
  }

  public async status(): Promise<boolean> {
    const tasks: SoloListr<CacheStatusContext> = this.taskList.newTaskList(
      [
        {
          title: 'Check cache status',
          task: async (context_): Promise<void> => {
            const config: CacheStatusConfigClass = {
              imageCacheHandler: ImageCacheHandlerBuilder.fromYaml(constants.SOLO_CACHE_IMAGES_TARGET_FILE)
                .engine(this.dockerClient)
                .build(),
            };

            context_.config = config;

            const items: readonly ArtifactHealthResult[] = await config.imageCacheHandler.healthcheck();
            const cachedItems: readonly CachedItem[] = await config.imageCacheHandler.list();

            const missingImages: string[] = items
              .filter((item): boolean => !item.healthy)
              .map((item): string => `${item.target.name}:${item.target.version}`);

            let totalBytes: number = 0;

            for (const item of cachedItems) {
              try {
                const stat = await fs.stat(item.localPath);
                totalBytes += stat.size;
              } catch {
                // missing files are already reflected by healthcheck
              }
            }

            const totalSizeMb: string = (totalBytes / (1024 * 1024)).toFixed(2);

            try {
              this.logger.showUser(`Cached images: ${items.length}`);
              this.logger.showUser(`Total size: ${totalSizeMb} MB`);
              this.logger.showUser(`Healthy: ${missingImages.length === 0}`);

              if (missingImages.length > 0) {
                this.logger.showList('Missing images', missingImages);
              }
            } catch {
              this.logger.showUser('No cache found');
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image status',
    );

    await tasks.run();

    return true;
  }

  // ------ Tasks ------ //

  private pullAndCacheContainerImages(): SoloListrTask<CachePullContext> {
    return {
      title: 'Pull and cache container images',
      task: async ({config: {imageCacheHandler}}, task): Promise<SoloListr<AnyListrContext>> => {
        return task.newListr(await imageCacheHandler.pull(), constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  private loadImagesIntoCluster(): SoloListrTask<CacheLoadContext> {
    return {
      title: 'Load images into cluster',
      task: async ({config: {imageCacheHandler, context}}, task): Promise<SoloListr<CacheLoadContext>> => {
        const subTasks: SoloListrTask<CacheLoadContext>[] = [];

        const newTasks: SoloListrTask<CacheLoadContext>[] = await imageCacheHandler.load(
          this.prepareClusterName(this.k8Factory.getK8(context).clusters().readCurrent()),
        );
        subTasks.push(...newTasks);

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  private showUserMessages(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Show user messages',
      skip: (): boolean => this.oneShotState.isActive(),
      task: (): void => {
        this.logger.showAllMessageGroups();
      },
    };
  }

  // ------ Helpers ------ //

  private prepareClusterName(clusterReference: ClusterReferenceName): string {
    return clusterReference.startsWith('kind-') ? clusterReference.replace('kind-', '') : clusterReference;
  }

  public async close(): Promise<void> {}
}
