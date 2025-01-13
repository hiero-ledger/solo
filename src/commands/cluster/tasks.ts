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
import {type BaseCommand} from '../base.js';
import {splitFlagInput} from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import path from 'path';
import chalk from 'chalk';
import {ListrLease} from '../../core/lease/listr_lease.js';
import {type K8} from '../../core/k8.js';
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import type {SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';
import type {SelectClusterContextContext} from './configs.js';
import type {Namespace} from '../../core/config/remote/types.js';
import type {LocalConfig} from '../../core/config/local_config.js';

export class ClusterCommandTasks {
  private readonly parent: BaseCommand;

  constructor(
    parent,
    private readonly k8: K8,
  ) {
    this.parent = parent;
  }

  updateLocalConfig(): SoloListrTask<SelectClusterContextContext> {
    return {
      title: 'Update local configuration',
      task: async (ctx, task) => {
        this.parent.logger.info('Compare local and remote configuration...');
        const configManager = this.parent.getConfigManager();
        const isQuiet = configManager.getFlag(flags.quiet);

        await this.parent.getRemoteConfigManager().modify(async remoteConfig => {
          // Update current deployment with a cluster list from remoteConfig
          const localConfig = this.parent.getLocalConfig();
          const localDeployments = localConfig.deployments;
          const remoteClusterList: string[] = [];
          for (const cluster of Object.keys(remoteConfig.clusters)) {
            if (localConfig.currentDeploymentName === remoteConfig.clusters[cluster]) {
              remoteClusterList.push(cluster);
            }
          }
          ctx.config.clusters = remoteClusterList;
          localDeployments[localConfig.currentDeploymentName].clusters = ctx.config.clusters;
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
                localConfig.clusterContextMapping[cluster] = this.parent.getK8().getKubeConfig().getCurrentContext();
              }

              // Prompt the user to select a context if mapping value is missing
              else {
                localConfig.clusterContextMapping[cluster] = await this.promptForContext(task, cluster);
              }
            }
          }
          this.parent.logger.info('Update local configuration...');
          await localConfig.write();
        });
      },
    };
  }

  private async getSelectedContext(
    task: SoloListrTaskWrapper<SelectClusterContextContext>,
    selectedCluster: string,
    localConfig: LocalConfig,
    isQuiet: boolean,
  ) {
    let selectedContext;
    if (isQuiet) {
      selectedContext = this.parent.getK8().getKubeConfig().getCurrentContext();
    } else {
      selectedContext = await this.promptForContext(task, selectedCluster);
      localConfig.clusterContextMapping[selectedCluster] = selectedContext;
    }
    return selectedContext;
  }

  private async promptForContext(task: SoloListrTaskWrapper<SelectClusterContextContext>, cluster: string) {
    const kubeContexts = this.parent.getK8().getContexts();
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
      this.parent.logger.showUser(
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
    this.parent.logger.showList(
      'Installed Charts',
      await this.parent.getChartManager().getInstalledCharts(clusterSetupNamespace),
    );
  }

  selectContext(): SoloListrTask<SelectClusterContextContext> {
    return {
      title: 'Read local configuration settings',
      task: async (_, task) => {
        this.parent.logger.info('Read local configuration settings...');
        const configManager = this.parent.getConfigManager();
        const isQuiet = configManager.getFlag<boolean>(flags.quiet);
        const deploymentName: string = configManager.getFlag<Namespace>(flags.namespace);
        let clusters = splitFlagInput(configManager.getFlag<string>(flags.clusterName));
        const contexts = splitFlagInput(configManager.getFlag<string>(flags.context));
        const localConfig = this.parent.getLocalConfig();
        let selectedContext: string;

        // If one or more contexts are provided, use the first one
        if (contexts.length) {
          selectedContext = contexts[0];
        }

        // If one or more clusters are provided, use the first one to determine the context
        // from the mapping in the LocalConfig
        else if (clusters.length) {
          selectedContext = await this.selectContextForFirstCluster(task, clusters, localConfig, isQuiet);
        }

        // If a deployment name is provided, get the clusters associated with the deployment from the LocalConfig
        // and select the context from the mapping, corresponding to the first deployment cluster
        else if (deploymentName) {
          const deployment = localConfig.deployments[deploymentName];

          if (deployment && deployment.clusters.length) {
            selectedContext = await this.selectContextForFirstCluster(task, deployment.clusters, localConfig, isQuiet);
          }

          // The provided deployment does not exist in the LocalConfig
          else {
            // Add the deployment to the LocalConfig with the currently selected cluster and context in KubeConfig
            if (isQuiet) {
              selectedContext = this.parent.getK8().getKubeConfig().getCurrentContext();
              const selectedCluster = this.parent.getK8().getKubeConfig().getCurrentCluster().name;
              localConfig.deployments[deploymentName] = {
                clusters: [selectedCluster],
              };

              if (!localConfig.clusterContextMapping[selectedCluster]) {
                localConfig.clusterContextMapping[selectedCluster] = selectedContext;
              }
            }

            // Prompt user for clusters and contexts
            else {
              clusters = splitFlagInput(await flags.clusterName.prompt(task, clusters));

              for (const cluster of clusters) {
                if (!localConfig.clusterContextMapping[cluster]) {
                  localConfig.clusterContextMapping[cluster] = await this.promptForContext(task, cluster);
                }
              }

              selectedContext = localConfig.clusterContextMapping[clusters[0]];
            }
          }
        }

        this.parent.getK8().getKubeConfig().setCurrentContext(selectedContext);
      },
    };
  }

  initialize(argv: any, configInit: ConfigBuilder) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return new Task('Initialize', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      if (argv[flags.devMode.name]) {
        this.parent.logger.setDevMode(true);
      }

      ctx.config = await configInit(argv, ctx, task);
    });
  }

  showClusterList() {
    return new Task('List all available clusters', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.showList('Clusters', this.parent.getK8().getClusters());
    });
  }

  getClusterInfo() {
    return new Task('Get cluster info', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      try {
        const cluster = this.parent.getK8().getKubeConfig().getCurrentCluster();
        this.parent.logger.showJSON(`Cluster Information (${cluster.name})`, cluster);
        this.parent.logger.showUser('\n');
      } catch (e: Error | unknown) {
        this.parent.logger.showUserError(e);
      }
    });
  }

  prepareChartValues(argv) {
    const self = this;

    return new Task(
      'Prepare chart values',
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        ctx.chartPath = await this.parent.prepareChartPath(
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

  installClusterChart(argv) {
    const parent = this.parent;
    return new Task(
      `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;
        const version = ctx.config.soloChartVersion;
        const valuesArg = ctx.valuesArg;

        try {
          parent.logger.debug(`Installing chart chartPath = ${ctx.chartPath}, version = ${version}`);
          await parent
            .getChartManager()
            .install(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART, ctx.chartPath, version, valuesArg);
        } catch (e: Error | unknown) {
          // if error, uninstall the chart and rethrow the error
          parent.logger.debug(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            e,
          );
          try {
            await parent.getChartManager().uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
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

  acquireNewLease(argv) {
    return new Task('Acquire new lease', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      const lease = await this.parent.getLeaseManager().create();
      return ListrLease.newAcquireLeaseTask(lease, task);
    });
  }

  uninstallClusterChart(argv) {
    const parent = this.parent;
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

        await parent.getChartManager().uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      ctx => !ctx.isChartInstalled,
    );
  }

  setupHomeDirectory() {
    return new Task('Setup home directory', async () => {
      this.parent.setupHomeDirectory();
    });
  }
}
