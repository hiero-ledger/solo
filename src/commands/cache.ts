// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type ArgvStruct} from '../types/aliases.js';
import {type SoloListr} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {PathEx} from '../business/utils/path-ex.js';
import fs from 'node:fs/promises';
import {ImageCacheHandlerBuilder} from '../integration/cache/impl/image-cache-handler-builder.js';
import {ImageCacheHandler} from '../integration/cache/impl/image-cache-handler.js';
import {ContainerEngineClient} from '../integration/container-engine/container-engine-client.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {DockerClient} from '../integration/container-engine/docker-client.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';

interface CachePullContext {
  config: object;
}

@injectable()
export class CacheCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.DockerClient) private dockerClient?: DockerClient) {
    super();

    this.dockerClient = patchInject(dockerClient, InjectTokens.DockerClient, this.constructor.name);
  }

  public async close(): Promise<void> {} // no-op

  private static readonly PULL_CONFIGS_NAME: string = 'deployConfigs';

  public static readonly PULL_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  public static readonly LIST_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  public static readonly CLEAR_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  public static readonly STATUS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  public async pull(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CachePullContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();
            await this.loadRemoteConfigOrWarn(argv);

            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            this.configManager.update(argv);

            flags.disablePrompts(CacheCommand.PULL_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.PULL_FLAGS_LIST.required,
              ...CacheCommand.PULL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = {};
          },
        },
        {
          title: 'Pull and cache container images',
          task: async (): Promise<void> => {
            await ImageCacheHandlerBuilder.fromYaml(constants.SOLO_CACHE_IMAGES_TARGET_FILE)
              .engine(this.dockerClient)
              .build()
              .pull();
          },
        },
        {
          title: 'Show user messages',
          skip: (): boolean => this.oneShotState.isActive(),
          task: (): void => {
            this.logger.showAllMessageGroups();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache pull',
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

  public async list(): Promise<boolean> {
    const tasks: SoloListr<any> = this.taskList.newTaskList(
      [
        {
          title: 'List cached images',
          task: async (): Promise<void> => {
            const cacheDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, 'images');
            const manifestPath: string = PathEx.join(cacheDirectory, 'manifest.json');

            try {
              const raw: string = await fs.readFile(manifestPath, 'utf-8');
              const manifest: {
                images: {image: string; archive: string}[];
              } = JSON.parse(raw);

              this.logger.showList(
                `Cached images: [${manifest.images.length}]`,
                manifest.images.map((image): string => image.image),
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
    const tasks: SoloListr<any> = this.taskList.newTaskList(
      [
        {
          title: 'Clear image cache',
          task: async (): Promise<void> => {
            const cacheDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, 'images');

            await fs.rm(cacheDirectory, {recursive: true, force: true});

            this.logger.info('Image cache cleared');
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
    const tasks: SoloListr<any> = this.taskList.newTaskList(
      [
        {
          title: 'Check cache status',
          task: async (): Promise<void> => {
            const cacheDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, 'images');
            const manifestPath: string = PathEx.join(cacheDirectory, 'manifest.json');

            try {
              const raw: string = await fs.readFile(manifestPath, 'utf-8');
              const manifest: {
                images: {image: string; archive: string}[];
              } = JSON.parse(raw);

              let totalSizeBytes: number = 0;
              const missingImages: string[] = [];

              for (const img of manifest.images) {
                try {
                  const stat = await fs.stat(img.archive);
                  totalSizeBytes += stat.size;
                } catch {
                  missingImages.push(img.image);
                }
              }

              this.logger.showUser(`Cached images: ${manifest.images.length}`);
              this.logger.showUser(`Total size: ${(totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
              this.logger.showUser(`Healthy: ${missingImages.length === 0}`);

              if (missingImages.length > 0) {
                this.logger.showUser(`Missing images: ${missingImages.join(', ')}`);
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
}
