// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {type ClusterReferenceName, type Context, type SoloListr, type SoloListrTask} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {ImageCacheHandlerBuilder} from '../integration/cache/impl/image-cache-handler-builder.js';
import {ImageCacheHandler} from '../integration/cache/impl/image-cache-handler.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {CachedItem} from '../integration/cache/models/impl/cached-item.js';
import {ArtifactHealthResult} from '../integration/cache/models/impl/artifact-health-result.js';
import fs from 'node:fs/promises';
import {Stats} from 'node:fs';
import {type ContainerEngineClient} from '../integration/container-engine/container-engine-client.js';
import {CacheImageTargetTemplateRenderer} from '../integration/cache/impl/cache-image-target-template-renderer.js';
import {PathEx} from '../business/utils/path-ex.js';
import {CacheImageTemplateValues} from '../integration/cache/models/impl/cache-image-template-values.js';
import * as version from '../../version.js';
import {DefaultCacheImageTemplateResolver} from '../integration/cache/impl/default-cache-image-template-resolver.js';
import {HEDERA_JSON_RPC_RELAY_EDGE_VERSION, HEDERA_PLATFORM_EDGE_VERSION} from '../../version.js';

interface CachePullConfigClass {
  imageCacheHandler: ImageCacheHandler;
  results: readonly CachedItem[];
  edgeEnabled: boolean;
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
  public static readonly CACHE_NOT_MATERIALIZED_ERROR_MESSAGE: string =
    'Cache image targets have not been materialized yet. Run `solo cache image pull` first.';

  public constructor(
    @inject(InjectTokens.ContainerEngineClient) private containerEngineClient?: ContainerEngineClient,
  ) {
    super();

    this.containerEngineClient = patchInject(
      containerEngineClient,
      InjectTokens.ContainerEngineClient,
      this.constructor.name,
    );
  }

  public async close(): Promise<void> {}

  // ------ Flags ------ //

  public static readonly PULL_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.devMode, flags.edgeEnabled],
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

            const edgeEnabled: boolean = this.configManager.getFlag(flags.edgeEnabled);

            const renderedYamlPath: string = await this.renderImageTargetsFile(edgeEnabled);

            context_.config = {
              imageCacheHandler: await this.buildImageCacheHandlerFromYaml(renderedYamlPath),
              results: [],
              edgeEnabled,
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
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            context_.config = {
              imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
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
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            const config: CacheListConfigClass = {
              imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
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
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            const renderedYamlPath: string = this.getRenderedImageTargetsFilePath(cacheDirectory);

            try {
              const config: CacheClearConfigClass = {
                imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
              };

              context_.config = config;

              await config.imageCacheHandler.clear();
            } catch (error) {
              if (
                !(error instanceof SoloError) ||
                error.message !== CacheCommand.CACHE_NOT_MATERIALIZED_ERROR_MESSAGE
              ) {
                throw error;
              }
            }

            await fs.rm(renderedYamlPath, {force: true});
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
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            const config: CacheStatusConfigClass = {
              imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
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
                const stat: Stats = await fs.stat(item.localPath);
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

  private getRenderedImageTargetsFilePath(cacheDirectory: string): string {
    return PathEx.join(cacheDirectory, 'config', CacheImageTargetTemplateRenderer.RENDERED_FILE_NAME);
  }

  private async renderImageTargetsFile(edgeEnabled: boolean): Promise<string> {
    const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);
    const renderedConfigDirectory: string = PathEx.join(cacheDirectory, 'config');

    return new CacheImageTargetTemplateRenderer(
      new DefaultCacheImageTemplateResolver(
        new CacheImageTemplateValues(
          edgeEnabled ? version.MIRROR_NODE_EDGE_VERSION : version.MIRROR_NODE_VERSION,
          edgeEnabled ? version.BLOCK_NODE_EDGE_VERSION : version.BLOCK_NODE_VERSION,
          edgeEnabled ? version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION : version.HEDERA_JSON_RPC_RELAY_VERSION,
          edgeEnabled ? version.EXPLORER_EDGE_VERSION : version.EXPLORER_VERSION,
          version.MINIO_OPERATOR_VERSION,
          edgeEnabled ? version.HEDERA_PLATFORM_EDGE_VERSION : version.HEDERA_PLATFORM_VERSION,
        ),
      ),
    ).renderToFile(constants.SOLO_CACHE_IMAGES_TARGET_FILE, renderedConfigDirectory);
  }

  private async buildImageCacheHandlerFromYaml(filePath: string): Promise<ImageCacheHandler> {
    return ImageCacheHandlerBuilder.fromYaml(filePath).engine(this.containerEngineClient).build();
  }

  private async buildImageCacheHandlerFromRenderedFile(cacheDirectory: string): Promise<ImageCacheHandler> {
    const renderedYamlPath: string = this.getRenderedImageTargetsFilePath(cacheDirectory);

    try {
      await fs.access(renderedYamlPath);
    } catch {
      throw new SoloError(CacheCommand.CACHE_NOT_MATERIALIZED_ERROR_MESSAGE);
    }

    return this.buildImageCacheHandlerFromYaml(renderedYamlPath);
  }
}
