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
import {KindClient} from '../../integration/kind/kind-client.js';
import {ClusterCreateResponse} from '../../integration/kind/model/create-cluster/cluster-create-response.js';
import {K8} from '../../integration/kube/k8.js';
import {MissingActiveContextError} from '../../integration/kube/errors/missing-active-context-error.js';
import {MissingActiveClusterError} from '../../integration/kube/errors/missing-active-cluster-error.js';
import {type DependencyManagerType} from '../../core/dependency-managers/dependency-manager.js';
import path from 'node:path';
import forEach from 'mocha-each';

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
  ) {
    super();
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, InitCommand.name);
    this.podmanInstallationDirectory = patchInject(
      podmanInstallationDirectory,
      InjectTokens.PodmanInstallationDir,
      InitCommand.name,
    );
  }

  public setupSystemFilesTasks(argv: any): SoloListrTask<InitContext>[] {
    const self = this;

    let cacheDirectory: string = this.configManager.getFlag<string>(flags.cacheDir) as string;
    if (!cacheDirectory) {
      cacheDirectory = constants.SOLO_CACHE_DIR as string;
    }

    return [
      {
        title: 'Setup home directory and cache',
        task: async (context_, task) => {
          self.configManager.update(argv);
          context_.dirs = this.setupHomeDirectory();
          let username: string = self.configManager.getFlag<string>(flags.username);
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
            self.logger.showList('Home Directories', context_.dirs);
            self.logger.showList('Chart Repository', context_.repoURLs);
          }

          if (directoryCreated) {
            self.logger.showUser(
              chalk.grey('\n***************************************************************************************'),
            );
            self.logger.showUser(
              chalk.grey(
                `Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR}\n` +
                  "If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.",
              ),
            );
            self.logger.showUser(
              chalk.grey('***************************************************************************************'),
            );
          }
        },
      },
    ] as SoloListrTask<InitContext>[];
  }

  public setupLocalClusterTasks(argv: any): SoloListrTask<InitContext>[] {
    const self = this;

    return [
      {
        title: 'Install Kind',
        task: async (_, task) => {
          const podmanDependency: DependencyManagerType = await self.depManager.getDependency(constants.PODMAN);
          const shouldInstallPodman: boolean = await podmanDependency.shouldInstall();

          const podmanDependencies: string[] = shouldInstallPodman
            ? [constants.PODMAN, constants.VFKIT, constants.GVPROXY]
            : [];
          const deps: string[] = [...podmanDependencies, constants.KIND];

          const subTasks = self.depManager.taskCheckDependencies<InitContext>(deps);

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
        skip: this.skipKindSetup.bind(this),
      },
      {
        title: 'Create default cluster',
        task: async (_, task) => {
          const subTasks: SoloListrTask<InitContext>[] = [];

          const podmanDependency: DependencyManagerType = await self.depManager.getDependency(constants.PODMAN);
          const skipPodmanTasks: boolean = !(await podmanDependency.shouldInstall());

          subTasks.push(
            {
              title: 'Create Podman machine...',
              task: async () => {
                await podmanDependency.setupConfig();
                // const podmanExecutable: string = 'podman';
                const podmanExecutable: string = await self.depManager.getExecutablePath(constants.PODMAN);
                // await this.run(`${podmanExecutable} machine init --memory=16384`); // 16GB
                // await this.run(`${podmanExecutable} machine start`);
                await this.run(`${podmanExecutable} system connection list`);
                // await this.run(`${podmanExecutable} network create kind --subnet 172.19.0.0/16`);
                // await this.run(`${podmanExecutable} system connection list`);
              },
              skip: (): boolean => skipPodmanTasks,
            } as SoloListrTask<InitContext>,
            {
              title: 'Configure kind to use podman...',
              task: async () => {
                process.env.PATH = `${this.podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`;
                process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';
              },
              skip: (): boolean => skipPodmanTasks,
            } as SoloListrTask<InitContext>,
            {
              title: 'Creating local cluster...',
              task: async context_ => {
                const kindExecutable: string = await self.depManager.getExecutablePath(constants.KIND);
                const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();
                const clusterResponse: ClusterCreateResponse = await kindClient.createCluster(
                  constants.DEFAULT_CLUSTER,
                );
                task.title = `Created local cluster '${clusterResponse.name}'; connect with context '${clusterResponse.context}'`;
              },
            } as SoloListrTask<InitContext>,
          );

          return task.newListr(subTasks, {
            concurrent: false, // should not use concurrent as cluster creation may be called before dependencies are finished installing
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
        skip: this.skipKindSetup.bind(this),
      },
    ];
  }

  public installDependenciesTasks(options: InitDependenciesOptions): SoloListrTask<InitContext>[] {
    const self = this;

    if (!options.deps || options.deps.length === 0) {
      return [];
    }

    const tasks: SoloListrTask<InitContext>[] = [
      {
        title: 'Check dependencies',
        task: (_, task) => {
          const subTasks = self.depManager.taskCheckDependencies<InitContext>(options.deps);

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
      tasks.push(...this.setupLocalClusterTasks({}));
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
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
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

  private async skipKindSetup(): Promise<boolean> {
    try {
      const k8: K8 = this.k8Factory.default();
      const contextName: string = k8.contexts().readCurrent();
      if (!contextName) {
        return false;
      }

      // Try to verify the cluster is actually accessible by making a simple API call
      try {
        await k8.namespaces().list();
        return true;
      } catch {
        // If we can't connect to the cluster, don't skip cluster creation
        // This handles cases where contexts exist but clusters are not running
        return false;
      }
    } catch (error) {
      return !(error instanceof MissingActiveContextError || error instanceof MissingActiveClusterError);
    }
  }

  /**
   * Return Yargs command definition for 'init' command
   * @returns A object representing the Yargs command definition
   */
  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: InitCommand.COMMAND_NAME,
      desc: 'Initialize local environment',
      builder: (y: any) => {
        // set the quiet flag even though it isn't used for consistency across all commands
        flags.setOptionalCommandFlags(y, flags.cacheDir, flags.quiet, flags.username);
      },
      handler: async (argv: any) => {
        await self
          .init(argv)
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
