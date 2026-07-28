// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from '../base.js';
import fs from 'node:fs';
import * as constants from '../../core/constants.js';
import {Flags as flags} from '../flags.js';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import {FilePermissions} from '../../business/utils/file-permissions.js';
import {inject, injectable} from 'tsyringe-neo';
import {type InitDependenciesOptions, type SoloListrTask} from '../../types/index.js';
import {InitConfig} from './init-config.js';
import {InitContext} from './init-context.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ClusterTaskManager} from '../../core/cluster-task-manager.js';

/**
 * One-time local environment setup: Solo's home/cache directories, the packaged templates, and the
 * external dependencies (podman, helm, kubectl, ...). Every command runs the system-file tasks through
 * {@link Middlewares.initSystemFiles}, and the dependency tasks are pulled in by
 * {@link CommandBuilder}; there is no longer a user-facing command for it.
 */
@injectable()
export class InitCommand extends BaseCommand {
  private static hasShownDevSystemFileLists: boolean = false;

  public constructor(
    @inject(InjectTokens.PodmanInstallationDirectory) protected readonly podmanInstallationDirectory: string,
    @inject(InjectTokens.ClusterTaskManager) protected readonly clusterTaskManager: ClusterTaskManager,
  ) {
    super();
    this.clusterTaskManager = patchInject(clusterTaskManager, InjectTokens.ClusterTaskManager, InitCommand.name);
    this.podmanInstallationDirectory = patchInject(
      podmanInstallationDirectory,
      InjectTokens.PodmanInstallationDirectory,
      InitCommand.name,
    );
  }

  public setupSystemFilesTasks(argv: any): SoloListrTask<InitContext>[] {
    let cacheDirectory: string = this.configManager.getFlag<string>(flags.cacheDir) as string;
    if (!cacheDirectory) {
      cacheDirectory = constants.SOLO_CACHE_DIR as string;
    }

    return [
      {
        title: 'Setup home directory and cache',
        task: async (context_: InitContext, task): Promise<void> => {
          this.configManager.update(argv);
          context_.dirs = this.setupHomeDirectory();
          let username: string = this.configManager.getFlag<string>(flags.username);
          if (username && !flags.username.validate(username)) {
            username = await flags.username.prompt(task, username);
          }
          context_.config = {username} as InitConfig;
        },
      },
      {
        title: 'Create local configuration',
        skip: (): boolean => this.localConfig.configFileExists(),
        task: async (): Promise<void> => {
          await this.localConfig.load();
        },
      },
      {
        title: `Copy templates in '${cacheDirectory}'`,
        task: (context_: InitContext): void => {
          let directoryCreated: boolean = false;
          const resources: string[] = ['templates'];
          for (const directoryName of resources) {
            const sourceDirectory: string = PathEx.safeJoinWithBaseDirConfinement(
              constants.RESOURCES_DIR,
              directoryName,
            );
            if (!fs.existsSync(sourceDirectory)) {
              continue;
            }

            const destinationDirectory: string = PathEx.join(cacheDirectory, directoryName);
            if (!fs.existsSync(destinationDirectory)) {
              directoryCreated = true;
              fs.mkdirSync(destinationDirectory, {recursive: true});
            }

            fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
            // cpSync preserves the packaged source mode (0755) and bypasses the process umask.
            FilePermissions.restrictTreeToOwner(destinationDirectory);
          }

          if (argv.debug && !InitCommand.hasShownDevSystemFileLists) {
            this.logger.showList('Home Directories', context_.dirs);
            this.logger.showList('Chart Repository', context_.repoURLs);
            InitCommand.hasShownDevSystemFileLists = true;
          }

          if (directoryCreated) {
            this.logger.showUser(
              chalk.grey('\n***************************************************************************************'),
            );
            this.logger.showUser(
              chalk.grey(
                `Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR}\n` +
                  'If a full reset is needed, delete the directory or relevant sub-directories before re-running solo.',
              ),
            );
            this.logger.showUser(
              chalk.grey('***************************************************************************************'),
            );
          }
        },
      },
    ] as SoloListrTask<InitContext>[];
  }

  public installDependenciesTasks(options: InitDependenciesOptions): SoloListrTask<InitContext>[] {
    if (!options.deps || options.deps.length === 0) {
      return [];
    }

    const tasks: SoloListrTask<InitContext>[] = [
      this.dockerDesktopPreflightTask(),
      {
        title: 'Check dependencies',
        task: (_, task) => {
          const subTasks: SoloListrTask<InitContext>[] = this.depManager.taskCheckDependencies<InitContext>(
            options.deps,
          );

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
      },
    ];

    if (options.deps.includes(constants.HELM)) {
      tasks.push({
        title: 'Setup chart manager',
        task: async (context_: InitContext): Promise<void> => {
          context_.repoURLs = await this.chartManager.setup();
        },
      });
    }

    if (options.createCluster) {
      tasks.push(...this.clusterTaskManager.setupLocalClusterTasks(options.useSmallMemoryCluster));
    }

    return tasks;
  }

  public close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
