// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from '../base.js';
import fs from 'node:fs';
import * as constants from '../../core/constants.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {Flags as flags} from '../flags.js';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandDefinition, type InitDependenciesOptions, type SoloListrTask} from '../../types/index.js';
import {InitConfig} from './init-config.js';
import {InitContext} from './init-context.js';
import {Listr, ListrRendererValue} from 'listr2';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type DefaultKindClientBuilder} from '../../integration/kind/impl/default-kind-client-builder.js';
import {BrewPackageManager} from '../../core/package-managers/brew-package-manager.js';
import {OsPackageManager} from '../../core/package-managers/os-package-manager.js';
import {ClusterTaskManager} from '../../core/cluster-task-manager.js';

/**
 * Defines the core functionalities of 'init' command
 */
@injectable()
export class InitCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'init';
  public static readonly INIT_COMMAND_NAME: string = InitCommand.COMMAND_NAME;

  public constructor(
    @inject(InjectTokens.KindBuilder) protected readonly kindBuilder: DefaultKindClientBuilder,
    @inject(InjectTokens.PodmanInstallationDir) protected readonly podmanInstallationDirectory: string,
    @inject(InjectTokens.BrewPackageManager) protected readonly brewPackageManager: BrewPackageManager,
    @inject(InjectTokens.OsPackageManager) protected readonly osPackageManager: OsPackageManager,
    @inject(InjectTokens.ClusterTaskManager) protected readonly clusterTaskManager: ClusterTaskManager,
  ) {
    super();
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, InitCommand.name);
    this.brewPackageManager = patchInject(brewPackageManager, InjectTokens.BrewPackageManager, InitCommand.name);
    this.osPackageManager = patchInject(osPackageManager, InjectTokens.OsPackageManager, InitCommand.name);
    this.clusterTaskManager = patchInject(clusterTaskManager, InjectTokens.ClusterTaskManager, InitCommand.name);
    this.podmanInstallationDirectory = patchInject(
      podmanInstallationDirectory,
      InjectTokens.PodmanInstallationDir,
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
        task: async (context_, task) => {
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
        skip: () => this.localConfig.configFileExists(),
        task: async (): Promise<void> => {
          await this.localConfig.load();
        },
      },
      {
        title: `Copy templates in '${cacheDirectory}'`,
        task: context_ => {
          let directoryCreated: boolean = false;
          const resources = ['templates', 'profiles'];
          for (const directoryName of resources) {
            const sourceDirectory = PathEx.safeJoinWithBaseDirConfinement(
              constants.RESOURCES_DIR,
              constants.RESOURCES_DIR,
              directoryName,
            );
            if (!fs.existsSync(sourceDirectory)) {
              continue;
            }

            const destinationDirectory = PathEx.join(cacheDirectory, directoryName);
            if (!fs.existsSync(destinationDirectory)) {
              directoryCreated = true;
              fs.mkdirSync(destinationDirectory, {recursive: true});
            }

            fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
          }

          if (argv.dev) {
            this.logger.showList('Home Directories', context_.dirs);
            this.logger.showList('Chart Repository', context_.repoURLs);
          }

          if (directoryCreated) {
            this.logger.showUser(
              chalk.grey('\n***************************************************************************************'),
            );
            this.logger.showUser(
              chalk.grey(
                `Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR}\n` +
                  "If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.",
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
      {
        title: 'Check dependencies',
        task: (_, task) => {
          const subTasks = this.depManager.taskCheckDependencies<InitContext>(options.deps);

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
        task: async context_ => {
          context_.repoURLs = await this.chartManager.setup();
        },
      });
    }

    if (options.createCluster) {
      tasks.push(...this.clusterTaskManager.setupLocalClusterTasks());
    }

    return tasks;
  }

  /** Executes the init CLI command */
  public initTasks(argv: any): Listr<InitContext, ListrRendererValue, ListrRendererValue> {
    return this.taskList.newTaskList(
      [
        ...this.setupSystemFilesTasks(argv),
        ...this.installDependenciesTasks({
          deps: [constants.HELM, constants.KUBECTL],
          createCluster: false,
        }),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      InitCommand.INIT_COMMAND_NAME,
    );
  }

  public async init(argv: any): Promise<boolean> {
    const tasks: Listr<InitContext, ListrRendererValue, ListrRendererValue> = this.initTasks(argv);

    this.logger.showUser(
      chalk.grey('**********************************************************************************'),
    );
    this.logger.showUser(chalk.grey("'solo init' is now deprecated, you don't need to run it anymore."));
    this.logger.showUser(
      chalk.grey('**********************************************************************************\n'),
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error: Error | any) {
        throw new SoloError('Error running init', error);
      }
    }

    return true;
  }

  /**
   * Return Yargs command definition for 'init' command
   * @returns A object representing the Yargs command definition
   */
  public getCommandDefinition(): CommandDefinition {
    return {
      command: InitCommand.COMMAND_NAME,
      desc: 'Initialize local environment',
      builder: (y: any) => {
        // set the quiet flag even though it isn't used for consistency across all commands
        flags.setOptionalCommandFlags(y, flags.cacheDir, flags.quiet, flags.username);
      },
      handler: async (argv: any) => {
        await this.init(argv)
          .then(r => {
            if (!r) {
              throw new SoloError('Error running init, expected return value to be true');
            }
          })
          .catch(error => {
            throw new SoloError('Error running init', error);
          });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
