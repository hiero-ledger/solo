/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {Task} from '../../core/task.js';
import {Flags as flags} from '../flags.js';
import type {ListrTaskWrapper} from 'listr2';
import type {ConfigBuilder} from '../../types/aliases.js';
import {prepareChartPath, splitFlagInput} from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import path from 'path';
import chalk from 'chalk';
import {ListrLease} from '../../core/lease/listr_lease.js';
import {ErrorMessages} from '../../core/error_messages.js';
import {SoloError} from '../../core/errors.js';
import {RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import type {RemoteConfigDataWrapper} from '../../core/config/remote/remote_config_data_wrapper.js';
import {K8} from '../../core/k8.js';
import type {Cluster} from '@kubernetes/client-node/dist/config_types.js';
import type {SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';
import type {SelectClusterContextContext} from './configs.js';
import type {Namespace} from '../../core/config/remote/types.js';
import {LocalConfig} from '../../core/config/local_config.js';
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {inject, injectable} from "tsyringe-neo";
import {patchInject} from "../../core/container_helper.js";
import {ConfigManager} from "../../core/config_manager.js";
import {SoloLogger} from "../../core/logging.js";
import {ChartManager} from "../../core/chart_manager.js";
import {LeaseManager} from "../../core/lease/lease_manager.js";
import {Helm} from "../../core/helm.js";

@injectable()
export class ClusterCommandTasks {
    constructor(
        @inject(K8) private readonly k8: K8,
        @inject(ConfigManager) private readonly configManager: ConfigManager,
        @inject(RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
        @inject(LocalConfig) private readonly localConfig: LocalConfig,
        @inject(SoloLogger) private readonly logger: SoloLogger,
        @inject(ChartManager) private readonly chartManager: ChartManager,
        @inject(LeaseManager) private readonly leaseManager: LeaseManager,
        @inject(Helm) private readonly helm: Helm,

  ) {
        this.k8 = patchInject(k8, K8, this.constructor.name);
        this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
        this.remoteConfigManager = patchInject(remoteConfigManager, RemoteConfigManager, this.constructor.name);
        this.localConfig = patchInject(localConfig, LocalConfig, this.constructor.name);
        this.logger = patchInject(logger, SoloLogger, this.constructor.name);
        this.chartManager = patchInject(chartManager, ChartManager, this.constructor.name);
        this.leaseManager = patchInject(leaseManager, LeaseManager, this.constructor.name);
        this.helm = patchInject(helm, Helm, this.constructor.name);
  }

  public testConnectionToCluster(cluster: string, localConfig: LocalConfig, parentTask: ListrTaskWrapper<any, any, any>) {
    const self = this;
    return {
      title: `Test connection to cluster: ${chalk.cyan(cluster)}`,
      task: async (_, subTask: ListrTaskWrapper<any, any, any>) => {
        let context = localConfig.clusterContextMapping[cluster];
        if (!context) {
          const isQuiet = self.configManager.getFlag(flags.quiet);
          if (isQuiet) {
            context = self.k8.getCurrentContext();
          } else {
            context = await self.promptForContext(parentTask, cluster);
          }

          localConfig.clusterContextMapping[cluster] = context;
        }
        if (!(await self.k8.testClusterConnection(context, cluster))) {
          subTask.title = `${subTask.title} - ${chalk.red('Cluster connection failed')}`;
          throw new SoloError(`${ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER_DETAILED(context, cluster)}`);
        }
      },
    };
  }

  public validateRemoteConfigForCluster(
    cluster: string,
    currentCluster: Cluster,
    localConfig: LocalConfig,
    currentRemoteConfig: RemoteConfigDataWrapper,
  ) {
    const self = this;
    return {
      title: `Pull and validate remote configuration for cluster: ${chalk.cyan(cluster)}`,
      task: async (_, subTask: ListrTaskWrapper<any, any, any>) => {
        const context = localConfig.clusterContextMapping[cluster];
        self.k8.setCurrentContext(context);
        const remoteConfigFromOtherCluster = await self.remoteConfigManager.get();
        if (!RemoteConfigManager.compare(currentRemoteConfig, remoteConfigFromOtherCluster)) {
          throw new SoloError(ErrorMessages.REMOTE_CONFIGS_DO_NOT_MATCH(currentCluster.name, cluster));
        }
      },
    };
  }

  public readClustersFromRemoteConfig(argv) {
    const self = this;
    return {
      title: 'Read clusters from remote config',
      task: async (ctx, task) => {
        const localConfig = this.localConfig;
        const currentCluster = this.k8.getCurrentCluster();
        const currentClusterName = this.k8.getCurrentClusterName();
        const currentRemoteConfig: RemoteConfigDataWrapper = await this.remoteConfigManager.get();
        const subTasks = [];
        const remoteConfigClusters = Object.keys(currentRemoteConfig.clusters);
        const otherRemoteConfigClusters: string[] = remoteConfigClusters.filter(c => c !== currentClusterName);

        // Validate connections for the other clusters
        for (const cluster of otherRemoteConfigClusters) {
          subTasks.push(self.testConnectionToCluster(cluster, localConfig, task));
        }

        // Pull and validate RemoteConfigs from the other clusters
        for (const cluster of otherRemoteConfigClusters) {
          subTasks.push(self.validateRemoteConfigForCluster(cluster, currentCluster, localConfig, currentRemoteConfig));
        }

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  public updateLocalConfig(): SoloListrTask<SelectClusterContextContext> {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.logger.info('Compare local and remote configuration...');
      const configManager = this.configManager;
      const isQuiet = configManager.getFlag(flags.quiet);

      await this.remoteConfigManager.modify(async remoteConfig => {
        // Update current deployment with cluster list from remoteConfig
        const localConfig = this.localConfig;
        const localDeployments = localConfig.deployments;
        const remoteClusterList: string[] = [];

        const namespace = remoteConfig.metadata.name;
        localConfig.currentDeploymentName = remoteConfig.metadata.name;

        if (localConfig.deployments[namespace]) {
          for (const cluster of Object.keys(remoteConfig.clusters)) {
            if (localConfig.currentDeploymentName === remoteConfig.clusters[cluster]) {
              remoteClusterList.push(cluster);
            }
          }
          ctx.config.clusters = remoteClusterList;
          localDeployments[localConfig.currentDeploymentName].clusters = ctx.config.clusters;
        } else {
          const clusters = Object.keys(remoteConfig.clusters);
          localDeployments[namespace] = {clusters};
          ctx.config.clusters = clusters;
        }

        localConfig.setDeployments(localDeployments);

        const contexts = splitFlagInput(configManager.getFlag(flags.context));

        for (let i = 0; i < ctx.config.clusters.length; i++) {
          const cluster = ctx.config.clusters[i];
          const context = contexts[i];

          // If a context is provided, use it to update the mapping
          if (context) {
            localConfig.clusterContextMapping[cluster] = context;
          } else if (!localConfig.clusterContextMapping[cluster]) {
            // In quiet mode, use the currently selected context to update the mapping
            if (isQuiet) {
              localConfig.clusterContextMapping[cluster] = this.k8.getCurrentContext();
            }

            // Prompt the user to select a context if mapping value is missing
            else {
              localConfig.clusterContextMapping[cluster] = await this.promptForContext(task, cluster);
            }
          }
        }
        this.logger.info('Update local configuration...');
        await localConfig.write();
      });
    });
  }

  private async getSelectedContext(
    task: SoloListrTaskWrapper<SelectClusterContextContext>,
    selectedCluster: string,
    localConfig: LocalConfig,
    isQuiet: boolean,
  ) {
    let selectedContext;
    if (isQuiet) {
      selectedContext = this.k8.getCurrentContext();
    } else {
      selectedContext = await this.promptForContext(task, selectedCluster);
      localConfig.clusterContextMapping[selectedCluster] = selectedContext;
    }
    return selectedContext;
  }

  private async promptForContext(task: SoloListrTaskWrapper<SelectClusterContextContext>, cluster: string) {
    const kubeContexts = this.k8.getContexts();
    return flags.context.prompt(
      task,
      kubeContexts.map(c => c.name),
      cluster,
    );
  }

  private async selectContextForFirstCluster(
    task: SoloListrTaskWrapper<SelectClusterContextContext>,
    clusters: string[],
    localConfig: LocalConfig,
    isQuiet: boolean,
  ) {
    const selectedCluster = clusters[0];

    if (localConfig.clusterContextMapping[selectedCluster]) {
      return localConfig.clusterContextMapping[selectedCluster];
    }

    // If a cluster does not exist in LocalConfig mapping prompt the user to select a context or use the current one
    else {
      return this.getSelectedContext(task, selectedCluster, localConfig, isQuiet);
    }
  }

  /**
   * Prepare values arg for cluster setup command
   *
   * @param [chartDir] - local charts directory (default is empty)
   * @param [prometheusStackEnabled] - a bool to denote whether to install prometheus stack
   * @param [minioEnabled] - a bool to denote whether to install minio
   * @param [certManagerEnabled] - a bool to denote whether to install cert manager
   * @param [certManagerCrdsEnabled] - a bool to denote whether to install cert manager CRDs
   */
  private prepareValuesArg(
    chartDir = flags.chartDirectory.definition.defaultValue as string,
    prometheusStackEnabled = flags.deployPrometheusStack.definition.defaultValue as boolean,
    minioEnabled = flags.deployMinio.definition.defaultValue as boolean,
    certManagerEnabled = flags.deployCertManager.definition.defaultValue as boolean,
    certManagerCrdsEnabled = flags.deployCertManagerCrds.definition.defaultValue as boolean,
  ) {
    let valuesArg = chartDir ? `-f ${path.join(chartDir, 'solo-cluster-setup', 'values.yaml')}` : '';

    valuesArg += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`;
    valuesArg += ` --set cloud.certManager.enabled=${certManagerEnabled}`;
    valuesArg += ` --set cert-manager.installCRDs=${certManagerCrdsEnabled}`;
    valuesArg += ` --set cloud.minio.enabled=${minioEnabled}`;

    if (certManagerEnabled && !certManagerCrdsEnabled) {
      this.logger.showUser(
        chalk.yellowBright('> WARNING:'),
        chalk.yellow(
          'cert-manager CRDs are required for cert-manager, please enable it if you have not installed it independently.',
        ),
      );
    }

    return valuesArg;
  }

  /** Show list of installed chart */
  private async showInstalledChartList(clusterSetupNamespace: string) {
    this.logger.showList(
      'Installed Charts',
      await this.chartManager.getInstalledCharts(clusterSetupNamespace),
    );
  }

  public selectContext(): SoloListrTask<SelectClusterContextContext> {
    return {
      title: 'Read local configuration settings',
      task: async (_, task) => {
        this.logger.info('Read local configuration settings...');
        const configManager = this.configManager;
        const isQuiet = configManager.getFlag<boolean>(flags.quiet);
        const deploymentName: string = configManager.getFlag<Namespace>(flags.namespace);
        let clusters = splitFlagInput(configManager.getFlag<string>(flags.clusterName));
        const contexts = splitFlagInput(configManager.getFlag<string>(flags.context));
        const localConfig = this.localConfig;
        let selectedContext: string;
        let selectedCluster: string;

        // If one or more contexts are provided, use the first one
        if (contexts.length) {
          selectedContext = contexts[0];
        }

        // If one or more clusters are provided, use the first one to determine the context
        // from the mapping in the LocalConfig
        else if (clusters.length) {
          selectedCluster = clusters[0];
          selectedContext = await this.selectContextForFirstCluster(task, clusters, localConfig, isQuiet);
        }

        // If a deployment name is provided, get the clusters associated with the deployment from the LocalConfig
        // and select the context from the mapping, corresponding to the first deployment cluster
        else if (deploymentName) {
          const deployment = localConfig.deployments[deploymentName];

          if (deployment && deployment.clusters.length) {
            selectedCluster = deployment.clusters[0];
            selectedContext = await this.selectContextForFirstCluster(task, deployment.clusters, localConfig, isQuiet);
          }

          // The provided deployment does not exist in the LocalConfig
          else {
            // Add the deployment to the LocalConfig with the currently selected cluster and context in KubeConfig
            if (isQuiet) {
              selectedContext = this.k8.getCurrentContext();
              selectedCluster = this.k8.getCurrentClusterName();
              localConfig.deployments[deploymentName] = {
                clusters: [selectedCluster],
              };

              if (!localConfig.clusterContextMapping[selectedCluster]) {
                localConfig.clusterContextMapping[selectedCluster] = selectedContext;
              }
            }

            // Prompt user for clusters and contexts
            else {
              const promptedClusters = await flags.clusterName.prompt(task, '');
              clusters = splitFlagInput(promptedClusters);

              for (const cluster of clusters) {
                if (!localConfig.clusterContextMapping[cluster]) {
                  localConfig.clusterContextMapping[cluster] = await this.promptForContext(task, cluster);
                }
              }

              selectedCluster = clusters[0];
              selectedContext = localConfig.clusterContextMapping[clusters[0]];
            }
          }
        }

        const connectionValid = await this.k8.testClusterConnection(selectedContext, selectedCluster);
        if (!connectionValid) {
          throw new SoloError(ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER(selectedContext));
        }
        this.k8.setCurrentContext(selectedContext);
        this.configManager.setFlag(flags.context, selectedContext);
      },
    };
  }

  public initialize(argv: any, configInit: ConfigBuilder) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return new Task('Initialize', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      if (argv[flags.devMode.name]) {
        this.logger.setDevMode(true);
      }

      ctx.config = await configInit(argv, ctx, task);
    });
  }

  public showClusterList() {
    return new Task('List all available clusters', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.logger.showList('Clusters', this.k8.getClusters());
    });
  }

    public getClusterInfo() {
    return new Task('Get cluster info', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      try {
        const cluster = this.k8.getCurrentCluster();
        this.logger.showJSON(`Cluster Information (${cluster.name})`, cluster);
        this.logger.showUser('\n');
      } catch (e: Error | unknown) {
        this.logger.showUserError(e);
      }
    });
  }

    public prepareChartValues(argv) {
    const self = this;

    return new Task(
      'Prepare chart values',
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        ctx.chartPath = await prepareChartPath(
          this.helm,
          ctx.config.chartDir,
          constants.SOLO_TESTING_CHART_URL,
          constants.SOLO_CLUSTER_SETUP_CHART,
        );

        // if minio is already present, don't deploy it
        if (ctx.config.deployMinio && (await self.k8.isMinioInstalled(ctx.config.clusterSetupNamespace))) {
          ctx.config.deployMinio = false;
        }

        // if prometheus is found, don't deploy it
        if (
          ctx.config.deployPrometheusStack &&
          !(await self.k8.isPrometheusInstalled(ctx.config.clusterSetupNamespace))
        ) {
          ctx.config.deployPrometheusStack = false;
        }

        // if cert manager is installed, don't deploy it
        if (
          (ctx.config.deployCertManager || ctx.config.deployCertManagerCrds) &&
          (await self.k8.isCertManagerInstalled())
        ) {
          ctx.config.deployCertManager = false;
          ctx.config.deployCertManagerCrds = false;
        }

        // If all are already present or not wanted, skip installation
        if (
          !ctx.config.deployPrometheusStack &&
          !ctx.config.deployMinio &&
          !ctx.config.deployCertManager &&
          !ctx.config.deployCertManagerCrds
        ) {
          ctx.isChartInstalled = true;
          return;
        }

        ctx.valuesArg = this.prepareValuesArg(
          ctx.config.chartDir,
          ctx.config.deployPrometheusStack,
          ctx.config.deployMinio,
          ctx.config.deployCertManager,
          ctx.config.deployCertManagerCrds,
        );
      },
      ctx => ctx.isChartInstalled,
    );
  }

    public installClusterChart(argv) {
    const self = this;
    return new Task(
      `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;
        const version = ctx.config.soloChartVersion;
        const valuesArg = ctx.valuesArg;

        try {
          self.logger.debug(`Installing chart chartPath = ${ctx.chartPath}, version = ${version}`);
          await self.chartManager.install(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART, ctx.chartPath, version, valuesArg);
        } catch (e: Error | unknown) {
          // if error, uninstall the chart and rethrow the error
          self.logger.debug(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            e,
          );
          try {
            await self.chartManager.uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
          } catch {
            // ignore error during uninstall since we are doing the best-effort uninstall here
          }

          throw e;
        }

        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      ctx => ctx.isChartInstalled,
    );
  }

    public acquireNewLease(argv) {
    return new Task('Acquire new lease', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      const lease = await this.leaseManager.create();
      return ListrLease.newAcquireLeaseTask(lease, task);
    });
  }

    public uninstallClusterChart(argv) {
    const self = this;

    return new Task(
      `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;

        if (!argv.force && (await self.k8.isRemoteConfigPresentInAnyNamespace())) {
          const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
            type: 'toggle',
            default: false,
            message:
              'There is remote config for one of the deployments' +
              'Are you sure you would like to uninstall the cluster?',
          });

          if (!confirm) {
            // eslint-disable-next-line n/no-process-exit
            process.exit(0);
          }
        }

        await self.chartManager.uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      ctx => !ctx.isChartInstalled,
    );
  }
}
