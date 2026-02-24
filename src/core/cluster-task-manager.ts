// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {ShellRunner} from './shell-runner.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {BrewPackageManager} from './package-managers/brew-package-manager.js';
import {OsPackageManager} from './package-managers/os-package-manager.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {PodmanMode, SoloListrTask} from '../types/index.js';
import {InitContext} from '../commands/init/init-context.js';
import {AptGetPackageManager} from './package-managers/apt-get-package-manager.js';
import {SoloError} from './errors/solo-error.js';
import * as constants from './constants.js';
import {getTemporaryDirectory} from './helpers.js';
import fs from 'node:fs';
import * as yaml from 'yaml';
import {type AnyObject} from '../types/aliases.js';
import path from 'node:path';
import {KindClient} from '../integration/kind/kind-client.js';
import {ClusterCreateResponse} from '../integration/kind/model/create-cluster/cluster-create-response.js';
import {type DefaultKindClientBuilder} from '../integration/kind/impl/default-kind-client-builder.js';
import {type DependencyManager, KindDependencyManager, PodmanDependencyManager} from './dependency-managers/index.js';
import {K8} from '../integration/kube/k8.js';
import {MissingActiveContextError} from '../integration/kube/errors/missing-active-context-error.js';
import {MissingActiveClusterError} from '../integration/kube/errors/missing-active-cluster-error.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';

@injectable()
export class ClusterTaskManager extends ShellRunner {
  public constructor(
    @inject(InjectTokens.BrewPackageManager) protected readonly brewPackageManager: BrewPackageManager,
    @inject(InjectTokens.OsPackageManager) protected readonly osPackageManager: OsPackageManager,
    @inject(InjectTokens.KindBuilder) protected readonly kindBuilder: DefaultKindClientBuilder,
    @inject(InjectTokens.PodmanDependencyManager) protected readonly podmanDependencyManager: PodmanDependencyManager,
    @inject(InjectTokens.KindDependencyManager) protected readonly kindDependencyManager: KindDependencyManager,
    @inject(InjectTokens.PodmanInstallationDirectory) protected readonly podmanInstallationDirectory: string,
    @inject(InjectTokens.K8Factory) protected readonly k8Factory: K8Factory,
    @inject(InjectTokens.DependencyManager) protected readonly depManager: DependencyManager,
  ) {
    super();

    this.brewPackageManager = patchInject(brewPackageManager, InjectTokens.BrewPackageManager, ClusterTaskManager.name);
    this.osPackageManager = patchInject(osPackageManager, InjectTokens.OsPackageManager, ClusterTaskManager.name);
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, ClusterTaskManager.name);
    this.podmanDependencyManager = patchInject(
      podmanDependencyManager,
      InjectTokens.KindBuilder,
      ClusterTaskManager.name,
    );
    this.kindDependencyManager = patchInject(kindDependencyManager, InjectTokens.KindBuilder, ClusterTaskManager.name);
    this.podmanInstallationDirectory = patchInject(
      podmanInstallationDirectory,
      InjectTokens.PodmanInstallationDirectory,
      ClusterTaskManager.name,
    );
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, ClusterTaskManager.name);
    this.depManager = patchInject(depManager, InjectTokens.DependencyManager, ClusterTaskManager.name);
  }

  private sudoCallbacks(task: any): {
    onSudoRequested: (message: string) => void;
    onSudoGranted: (message: string) => void;
  } {
    const originalTitle: string | any[] = task.title;
    const onSudoRequested: (message: string) => void = (message: string): void => {
      task.title = message;
    };
    const onSudoGranted: (message: string) => void = (_message: string): void => {
      task.title = originalTitle;
    };
    return {onSudoGranted, onSudoRequested};
  }

  public rootfullInstallTasks(parentTask): SoloListrTask<InitContext>[] {
    return [
      {
        title: 'Install git, iptables...',
        task: async (_, _subTask) => {
          try {
            // TODO include in integration/git GHI scope
            await this.run('git version');
          } catch {
            this.logger.info('Git not found, installing git...');
            const {onSudoGranted, onSudoRequested} = this.sudoCallbacks(parentTask);
            const osPackageManager: AptGetPackageManager =
              this.osPackageManager.getPackageManager() as AptGetPackageManager;
            osPackageManager.setOnSudoGranted(onSudoGranted);
            osPackageManager.setOnSudoRequested(onSudoRequested);
            await osPackageManager.update();
            await osPackageManager.installPackages(['git', 'iptables']);
          }
        },
      },
      {
        title: 'Install brew...',
        task: async (_, _subTask) => {
          const brewInstalled: boolean = await this.brewPackageManager.isAvailable();
          if (!brewInstalled) {
            this.logger.info('Homebrew not found, installing Homebrew...');
            if (!(await this.brewPackageManager.install())) {
              throw new SoloError('Failed to install Homebrew');
            }
          }
        },
      },
      {
        title: 'Install podman...',
        task: async (_, _subTask) => {
          try {
            const podmanVersion: string[] = await this.run('podman --version');
            this.logger.info(`Podman already installed: ${podmanVersion}`);
          } catch {
            this.logger.info('Podman not found, installing Podman...');
            await this.brewPackageManager.installPackages(['podman']);
            const brewBin: string[] = await this.run('which podman');
            process.env.PATH = `${process.env.PATH}:${brewBin.join('').replace('/podman', '')}`;
          }
        },
      } as SoloListrTask<InitContext>,
      {
        title: 'Creating local cluster...',
        task: async (_context, task) => {
          const whichPodman: string[] = await this.run('which podman');
          const podmanPath: string = whichPodman.join('').replace('/podman', '');
          const {onSudoGranted, onSudoRequested} = this.sudoCallbacks(task);
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            `KIND_EXPERIMENTAL_PROVIDER=podman PATH="$PATH:${podmanPath}" ${constants.SOLO_HOME_DIR}/bin/kind create cluster`,
          );

          // Merge kubeconfig data from root user into normal user's kubeconfig
          const user: string[] = await this.run('whoami');
          const temporaryDirectory: string = getTemporaryDirectory();

          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            `cp /root/.kube/config ${temporaryDirectory}/kube-config-root`,
          );
          await this.sudoRun(onSudoRequested, onSudoGranted, `chown ${user} ${temporaryDirectory}/kube-config-root`);
          await this.sudoRun(onSudoRequested, onSudoGranted, `chmod 755 ${temporaryDirectory}/kube-config-root`);

          const rootYamlData: string = fs.readFileSync(`${temporaryDirectory}/kube-config-root`, 'utf8');
          const rootConfig: Record<string, AnyObject> = yaml.parse(rootYamlData) as Record<string, AnyObject>;

          let userConfig: Record<string, AnyObject>;
          const clusterName: string = 'kind-kind';

          try {
            const userYamlData: string = fs.readFileSync(`/home/${user}/.kube/config`, 'utf8');
            userConfig = yaml.parse(userYamlData) as Record<string, AnyObject>;

            if (!userConfig.clusters) {
              userConfig.clusters = [];
            }
            userConfig.clusters.push(rootConfig.clusters.find(c => c.name === clusterName));

            if (!userConfig.contexts) {
              userConfig.contexts = [];
            }
            userConfig.contexts.push(rootConfig.contexts.find(c => c.name === clusterName));

            if (!userConfig.users) {
              userConfig.users = [];
            }
            userConfig.users.push(rootConfig.users.find(c => c.name === clusterName));

            userConfig['current-context'] = rootConfig['current-context'];
          } catch (error) {
            if (error.code === 'ENOENT') {
              const kubeConfigDirectory: string = `/home/${user}/.kube/`;
              if (!fs.existsSync(kubeConfigDirectory)) {
                fs.mkdirSync(kubeConfigDirectory, {recursive: true});
              }
              userConfig = rootConfig;
              userConfig.clusters = userConfig.clusters.filter(c => c.name === clusterName);
              userConfig.contexts = userConfig.contexts.filter(c => c.name === clusterName);
              userConfig.users = userConfig.users.filter(c => c.name === clusterName);
            } else {
              throw error;
            }
          }

          fs.writeFileSync(`/home/${user}/.kube/config`, yaml.stringify(userConfig), 'utf8');
          fs.rmSync(`${temporaryDirectory}/kube-config-root`);
        },
      } as SoloListrTask<InitContext>,
    ];
  }

  public async installationTasks(parentTask): Promise<SoloListrTask<InitContext>[]> {
    const skipPodmanTasks: boolean = !(await this.podmanDependencyManager.shouldInstall());
    if (this.podmanDependencyManager.mode === PodmanMode.ROOTFUL) {
      {
        return skipPodmanTasks ? [this.defaultCreateClusterTask(parentTask)] : this.rootfullInstallTasks(parentTask);
      }
    } else if (this.podmanDependencyManager.mode === PodmanMode.VIRTUAL_MACHINE) {
      {
        return [
          {
            title: 'Create Podman machine...',
            task: async () => {
              await this.podmanDependencyManager.setupConfig();
              const podmanExecutable: string = await this.podmanDependencyManager.getExecutable();
              try {
                await this.run(
                  `${podmanExecutable} machine inspect ${constants.PODMAN_MACHINE_NAME}`,
                  [],
                  false,
                  false,
                  {PATH: `${this.podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`},
                );
              } catch (error) {
                if (error.message.includes('VM does not exist')) {
                  await this.run(
                    `${podmanExecutable} machine init ${constants.PODMAN_MACHINE_NAME} --memory=16384`, // 16GB
                    [],
                    false,
                    false,
                    {PATH: `${this.podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`},
                  );
                  await this.run(
                    `${podmanExecutable} machine start ${constants.PODMAN_MACHINE_NAME}`,
                    [],
                    false,
                    false,
                    {PATH: `${this.podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`},
                  );
                } else {
                  throw new SoloError(`Failed to inspect Podman machine: ${error.message}`);
                }
              }
            },
            skip: (): boolean => skipPodmanTasks,
          } as SoloListrTask<InitContext>,
          {
            title: 'Configure kind to use podman...',
            task: async () => {
              // process.env.PATH = `${this.podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`;
              process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';
            },
            skip: (): boolean => skipPodmanTasks,
          } as SoloListrTask<InitContext>,
          this.defaultCreateClusterTask(parentTask),
        ];
      }
    }

    return [];
  }

  private defaultCreateClusterTask(parentTask): SoloListrTask<InitContext> {
    return {
      title: 'Creating local cluster...',
      task: async _context => {
        const kindExecutable: string = await this.kindDependencyManager.getExecutable();
        const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();
        const clusterResponse: ClusterCreateResponse = await kindClient.createCluster(constants.DEFAULT_CLUSTER);

        parentTask.title = `Created local cluster '${clusterResponse.name}'; connect with context '${clusterResponse.context}'`;
      },
    } as SoloListrTask<InitContext>;
  }

  public setupLocalClusterTasks(): SoloListrTask<InitContext>[] {
    return [
      {
        title: 'Install Kind',
        task: async (_, task) => {
          const podmanDependency: PodmanDependencyManager = this.podmanDependencyManager;
          const shouldInstallPodman: boolean = await podmanDependency.shouldInstall();

          const podmanDependencies: string[] =
            shouldInstallPodman && podmanDependency.mode === PodmanMode.VIRTUAL_MACHINE
              ? [constants.PODMAN, constants.VFKIT, constants.GVPROXY]
              : [];

          const deps: string[] = [...podmanDependencies, constants.KIND];

          const subTasks = this.depManager.taskCheckDependencies<InitContext>(deps);

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
          const subTasks: SoloListrTask<InitContext>[] = await this.installationTasks(task);
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
}
