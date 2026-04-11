// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {ShellRunner} from './shell-runner.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {BrewPackageManager} from './package-managers/brew-package-manager.js';
import {OsPackageManager} from './package-managers/os-package-manager.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {PodmanMode, SoloListrTask, type SoloListrTaskWrapper} from '../types/index.js';
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
import {KindCluster} from '../integration/kind/model/kind-cluster.js';
import {ClusterCreateResponse} from '../integration/kind/model/create-cluster/cluster-create-response.js';
import {type ClusterCreateOptions} from '../integration/kind/model/create-cluster/cluster-create-options.js';
import {ClusterCreateOptionsBuilder} from '../integration/kind/model/create-cluster/create-cluster-options-builder.js';
import {type DefaultKindClientBuilder} from '../integration/kind/impl/default-kind-client-builder.js';
import {type DependencyManager, KindDependencyManager, PodmanDependencyManager} from './dependency-managers/index.js';
import {K8} from '../integration/kube/k8.js';
import {MissingActiveContextError} from '../integration/kube/errors/missing-active-context-error.js';
import {MissingActiveClusterError} from '../integration/kube/errors/missing-active-cluster-error.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type GitClient} from '../integration/git/git-client.js';

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
    @inject(InjectTokens.KindInstallationDirectory) protected readonly kindInstallationDirectory: string,
    @inject(InjectTokens.GitClient) protected readonly gitClient: GitClient,
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
    this.kindInstallationDirectory = patchInject(
      kindInstallationDirectory,
      InjectTokens.KindInstallationDirectory,
      ClusterTaskManager.name,
    );
    this.gitClient = patchInject(gitClient, InjectTokens.GitClient, ClusterTaskManager.name);
  }

  private sudoCallbacks(task: SoloListrTaskWrapper<InitContext>): {
    onSudoRequested: (message: string) => void;
    onSudoGranted: (message: string) => void;
  } {
    const originalTitle: string = task.title;
    const onSudoRequested: (message: string) => void = (message: string): void => {
      task.title = message;
    };
    const onSudoGranted: (message: string) => void = (message: string): void => {
      void message;
      task.title = originalTitle;
    };
    return {onSudoGranted, onSudoRequested};
  }

  public rootfullInstallTasks(parentTask: SoloListrTaskWrapper<InitContext>): SoloListrTask<InitContext>[] {
    return [
      {
        title: 'Install git, iptables...',
        task: async (): Promise<void> => {
          try {
            await this.gitClient.version();
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
        task: async (): Promise<void> => {
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
        task: async (): Promise<void> => {
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
        task: async (_context: InitContext, task: SoloListrTaskWrapper<InitContext>): Promise<void> => {
          void _context;
          const whichPodman: string[] = await this.run('which podman');
          const podmanPath: string = whichPodman.join('').replace('/podman', '');
          const sudoRunOptions: [string[], boolean?, boolean?, Record<string, string>?] = [
            [],
            undefined,
            undefined,
            {
              PATH:
                `${this.podmanInstallationDirectory}${path.delimiter}` +
                `${this.kindInstallationDirectory}${path.delimiter}${process.env.PATH}`,
            },
          ];
          const {onSudoGranted, onSudoRequested} = this.sudoCallbacks(task);
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            `KIND_EXPERIMENTAL_PROVIDER=podman PATH="$PATH:${podmanPath}" kind create cluster --image "${constants.KIND_NODE_IMAGE}" --config "${constants.KIND_CLUSTER_CONFIG_FILE}"`,
            ...sudoRunOptions,
          );

          // Merge kubeconfig data from root user into normal user's kubeconfig
          const user: string[] = await this.run('whoami');
          const temporaryDirectory: string = getTemporaryDirectory();

          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            `cp /root/.kube/config ${temporaryDirectory}/kube-config-root`,
            ...sudoRunOptions,
          );
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            `chown ${user} ${temporaryDirectory}/kube-config-root`,
            ...sudoRunOptions,
          );
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            `chmod 755 ${temporaryDirectory}/kube-config-root`,
            ...sudoRunOptions,
          );

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
            userConfig.clusters.push(rootConfig.clusters.find((c: AnyObject): boolean => c.name === clusterName));

            if (!userConfig.contexts) {
              userConfig.contexts = [];
            }
            userConfig.contexts.push(rootConfig.contexts.find((c: AnyObject): boolean => c.name === clusterName));

            if (!userConfig.users) {
              userConfig.users = [];
            }
            userConfig.users.push(rootConfig.users.find((c: AnyObject): boolean => c.name === clusterName));

            userConfig['current-context'] = rootConfig['current-context'];
          } catch (error) {
            if (error.code === 'ENOENT') {
              const kubeConfigDirectory: string = `/home/${user}/.kube/`;
              if (!fs.existsSync(kubeConfigDirectory)) {
                fs.mkdirSync(kubeConfigDirectory, {recursive: true});
              }
              userConfig = rootConfig;
              userConfig.clusters = userConfig.clusters.filter((c: AnyObject): boolean => c.name === clusterName);
              userConfig.contexts = userConfig.contexts.filter((c: AnyObject): boolean => c.name === clusterName);
              userConfig.users = userConfig.users.filter((c: AnyObject): boolean => c.name === clusterName);
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

  public async installationTasks(parentTask: SoloListrTaskWrapper<InitContext>): Promise<SoloListrTask<InitContext>[]> {
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
            task: async (): Promise<void> => {
              const podmanRunOptions: [string[], boolean?, boolean?, Record<string, string>?] = [
                [],
                undefined,
                undefined,
                {
                  PATH: `${this.podmanInstallationDirectory}${path.delimiter}${process.env.PATH}`,
                },
              ];
              await this.podmanDependencyManager.setupConfig();
              const podmanExecutable: string = await this.podmanDependencyManager.getExecutable();
              try {
                await this.run(
                  `${podmanExecutable} machine inspect ${constants.PODMAN_MACHINE_NAME}`,
                  ...podmanRunOptions,
                );
              } catch (error) {
                if (error.message.includes('VM does not exist')) {
                  await this.run(
                    `${podmanExecutable} machine init ${constants.PODMAN_MACHINE_NAME} --memory=16384`, // 16GB
                    ...podmanRunOptions,
                  );
                  await this.run(
                    `${podmanExecutable} machine start ${constants.PODMAN_MACHINE_NAME}`,
                    ...podmanRunOptions,
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
            task: async (): Promise<void> => {
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

  private defaultCreateClusterTask(parentTask: SoloListrTaskWrapper<InitContext>): SoloListrTask<InitContext> {
    return {
      title: 'Creating local cluster...',
      task: async (): Promise<void> => {
        const kindExecutable: string = await this.kindDependencyManager.getExecutable();
        const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();

        // If the cluster already exists from an interrupted previous run, re-export
        // the kubeconfig and wait for the API to become accessible.
        const existingClusters: KindCluster[] = await kindClient.getClusters();
        if (existingClusters.some((cluster: KindCluster): boolean => cluster.name === constants.DEFAULT_CLUSTER)) {
          this.logger.info(
            `Cluster '${constants.DEFAULT_CLUSTER}' already exists; re-exporting kubeconfig for recovery`,
          );
          await kindClient.exportKubeConfig(constants.DEFAULT_CLUSTER);
          await this.waitForK8sApi();
          parentTask.title = `Reusing existing local cluster '${constants.DEFAULT_CLUSTER}'`;
          return;
        }

        const clusterCreateOptions: ClusterCreateOptions = ClusterCreateOptionsBuilder.builder()
          .image(constants.KIND_NODE_IMAGE)
          .config(constants.KIND_CLUSTER_CONFIG_FILE)
          .build();

        // Proactively remove any orphaned Docker containers/networks left behind by a
        // previous SIGKILL'd run.  If we don't do this, kind may try to reuse broken
        // containers and hang for up to 60 minutes.
        await this.cleanupOrphanedKindResources(kindClient);

        let clusterResponse: ClusterCreateResponse;
        try {
          clusterResponse = await this.createClusterWithTimeout(kindClient, clusterCreateOptions);
        } catch (error: unknown) {
          // If creation failed due to leftover containers/networks, clean up and retry once.
          // This handles cases where the proactive cleanup above ran before Docker had fully
          // torn down state from the previous run (e.g., "already in use" or kubeconfig errors).
          const message: string = error instanceof Error ? error.message : String(error);
          if (
            message.includes('already in use') ||
            message.includes('already exist') ||
            message.includes('failed to get cluster internal kubeconfig') ||
            message.includes('timed out')
          ) {
            this.logger.info(
              `Cluster '${constants.DEFAULT_CLUSTER}' creation failed (${message.split('\n')[0]}); cleaning up and retrying`,
            );
            try {
              await kindClient.deleteCluster(constants.DEFAULT_CLUSTER);
            } catch {
              // Cluster not registered with kind; nothing to delete at the kind level.
            }
            await this.cleanupOrphanedKindResources(kindClient);
            clusterResponse = await this.createClusterWithTimeout(kindClient, clusterCreateOptions);
          } else {
            throw error;
          }
        }

        parentTask.title = `Created local cluster '${clusterResponse.name}'; connect with context '${clusterResponse.context}'`;
      },
    } as SoloListrTask<InitContext>;
  }

  public setupLocalClusterTasks(): SoloListrTask<InitContext>[] {
    return [
      {
        title: 'Install Kind',
        task: async (_context: InitContext, task: SoloListrTaskWrapper<InitContext>): Promise<unknown> => {
          void _context;
          const podmanDependency: PodmanDependencyManager = this.podmanDependencyManager;
          const shouldInstallPodman: boolean = await podmanDependency.shouldInstall();

          const podmanDependencies: string[] =
            shouldInstallPodman && podmanDependency.mode === PodmanMode.VIRTUAL_MACHINE
              ? [constants.PODMAN, constants.VFKIT, constants.GVPROXY]
              : [];

          const deps: string[] = [...podmanDependencies, constants.KIND];

          const subTasks: SoloListrTask<InitContext>[] = this.depManager.taskCheckDependencies<InitContext>(deps);

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
        task: async (_context: InitContext, task: SoloListrTaskWrapper<InitContext>): Promise<unknown> => {
          void _context;
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

  /**
   * Aggressively remove all Docker containers and networks belonging to the Kind
   * cluster that may have been left behind by a SIGKILL'd previous run.
   * Errors are suppressed — missing containers/networks are fine.
   */
  private async cleanupOrphanedKindResources(kindClient: KindClient): Promise<void> {
    // Stop + remove any containers labelled for this cluster (kind labels them at
    // container-create time, so the label is present even for partially-initialised runs).
    await this.run(
      `ids=$(docker ps -aq --filter label=io.x-k8s.kind.cluster=${constants.DEFAULT_CLUSTER} 2>/dev/null); ` +
        `[ -n "$ids" ] && docker rm --force --volumes $ids 2>/dev/null || true`,
    ).catch((): void => {});
    // Remove the kind Docker bridge network if it still exists; a leftover network
    // can cause kubeadm to fail in the freshly-created replacement container.
    await this.run(`docker network rm kind 2>/dev/null || true`).catch((): void => {});
    // Belt-and-suspenders: also ask kind to delete the cluster (no-op if not registered).
    await kindClient.deleteCluster(constants.DEFAULT_CLUSTER).catch((): void => {});
  }

  /**
   * Creates a Kind cluster with a 5-minute hard timeout.  If the kind process
   * hangs (e.g. due to a broken control-plane container left from a prior run),
   * this ensures the caller can detect the failure quickly and retry.
   */
  private async createClusterWithTimeout(
    kindClient: KindClient,
    clusterCreateOptions: ClusterCreateOptions,
    timeoutMs: number = 5 * 60 * 1000,
  ): Promise<ClusterCreateResponse> {
    return Promise.race([
      kindClient.createCluster(constants.DEFAULT_CLUSTER, clusterCreateOptions),
      new Promise<ClusterCreateResponse>((_, reject): void => {
        setTimeout(
          (): void => reject(new SoloError(`Kind cluster creation timed out after ${timeoutMs / 1000}s`)),
          timeoutMs,
        );
      }),
    ]);
  }

  /**
   * Waits for the K8s API to become accessible.
   * Used after re-exporting kubeconfig for a cluster whose control plane may
   * still be initialising (e.g. after being interrupted mid-creation).
   */
  private async waitForK8sApi(maxAttempts: number = 20, intervalMs: number = 5000): Promise<void> {
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const k8: K8 = this.k8Factory.default();
        await k8.namespaces().list();
        this.logger.info(`K8s API is accessible (attempt ${attempt}/${maxAttempts})`);
        return;
      } catch {
        this.logger.info(`K8s API not yet accessible (attempt ${attempt}/${maxAttempts}); retrying in ${intervalMs}ms`);
        if (attempt < maxAttempts) {
          await new Promise<void>((resolve: () => void): void => {
            setTimeout(resolve, intervalMs);
          });
        }
      }
    }
    throw new SoloError(
      `K8s API did not become accessible after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`,
    );
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
