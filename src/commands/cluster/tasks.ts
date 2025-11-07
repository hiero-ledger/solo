// SPDX-License-Identifier: Apache-2.0

import {type AnyListrContext, type ArgvStruct, type ConfigBuilder} from '../../types/aliases.js';
import * as constants from '../../core/constants.js';
import chalk from 'chalk';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {ErrorMessages} from '../../core/error-messages.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {UserBreak} from '../../core/errors/user-break.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ClusterReferenceName, Context, type ReleaseNameData, type SoloListrTask} from '../../types/index.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {type ClusterChecks} from '../../core/cluster-checks.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type ClusterReferenceConnectContext} from './config-interfaces/cluster-reference-connect-context.js';
import {type ClusterReferenceDefaultContext} from './config-interfaces/cluster-reference-default-context.js';
import {type ClusterReferenceSetupContext} from './config-interfaces/cluster-reference-setup-context.js';
import {type ClusterReferenceResetContext} from './config-interfaces/cluster-reference-reset-context.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {StringFacade} from '../../business/runtime-state/facade/string-facade.js';
import {Lock} from '../../core/lock/lock.js';
import {RemoteConfigRuntimeState} from '../../business/runtime-state/config/remote/remote-config-runtime-state.js';
import * as versions from '../../../version.js';
import * as fs from 'node:fs';
import * as yaml from 'yaml';
import {findMinioOperator} from '../../core/helpers.js';

@injectable()
export class ClusterCommandTasks {
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.ClusterChecks) private readonly clusterChecks: ClusterChecks,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeState,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.clusterChecks = patchInject(clusterChecks, InjectTokens.ClusterChecks, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
  }

  public findMinioOperator(context: Context): Promise<ReleaseNameData> {
    return findMinioOperator(context, this.k8Factory);
  }

  public connectClusterRef(): SoloListrTask<ClusterReferenceConnectContext> {
    return {
      title: 'Associate a context with a cluster reference: ',
      task: async (context_, task): Promise<void> => {
        task.title += context_.config.clusterRef;

        this.localConfig.configuration.clusterRefs.set(
          context_.config.clusterRef,
          new StringFacade(context_.config.context),
        );

        await this.localConfig.persist();
      },
    };
  }

  public disconnectClusterRef(): SoloListrTask<ClusterReferenceDefaultContext> {
    return {
      title: 'Remove cluster reference ',
      task: async (context_, task): Promise<void> => {
        task.title += context_.config.clusterRef;

        this.localConfig.configuration.clusterRefs.delete(context_.config.clusterRef);
        await this.localConfig.persist();
      },
    };
  }

  public testConnectionToCluster(
    clusterReference?: ClusterReferenceName,
  ): SoloListrTask<ClusterReferenceConnectContext> {
    const self = this;
    return {
      title: 'Test connection to cluster: ',
      task: async (context_, task) => {
        task.title += clusterReference ?? context_.config.clusterRef;
        try {
          await self.k8Factory.getK8(context_.config.context).namespaces().list();
        } catch {
          task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`;
          throw new SoloError(
            `${ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER_DETAILED(context_.config.context, context_.config.clusterRef)}`,
          );
        }
      },
    };
  }

  public validateClusterRefs(): SoloListrTask<ClusterReferenceConnectContext> {
    const self = this;
    return {
      title: 'Validating cluster ref: ',
      task: async (context_, task) => {
        const {clusterRef} = context_.config;
        task.title = clusterRef;

        if (self.localConfig.configuration.clusterRefs.get(clusterRef)) {
          this.logger.showUser(chalk.yellow(`Cluster ref ${clusterRef} already exists inside local config`));
        }
      },
    };
  }

  /** Show list of installed chart */
  private async showInstalledChartList(clusterSetupNamespace: NamespaceName, context?: string): Promise<void> {
    // TODO convert to logger.addMessageGroup() & logger.addMessageGroupMessage()
    this.logger.showList(
      'Installed Charts',
      await this.chartManager.getInstalledCharts(clusterSetupNamespace, context),
    );
  }

  public initialize(
    argv: ArgvStruct,
    configInit: ConfigBuilder,
    loadRemoteConfig: boolean = false,
  ): SoloListrTask<AnyListrContext> {
    const {required, optional} = argv;
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    argv.flags = [...required, ...optional];

    return {
      title: 'Initialize',
      task: async (context_, task) => {
        await self.localConfig.load();

        if (loadRemoteConfig) {
          await self.remoteConfig.loadAndValidate(argv);
        }
        context_.config = await configInit(argv, context_, task);
      },
    };
  }

  public showClusterList(): SoloListrTask<AnyListrContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'List all available clusters',
      task: async () => {
        await self.localConfig.load();

        const clusterReferences = this.localConfig.configuration.clusterRefs;
        const clusterList = [];
        for (const [clusterName, clusterContext] of clusterReferences) {
          clusterList.push(`${clusterName}:${clusterContext}`);
        }
        this.logger.showList('Cluster references and the respective contexts', clusterList);
      },
    };
  }

  public getClusterInfo(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Get cluster info',
      task: async (context_, task) => {
        const clusterReference = context_.config.clusterRef;
        const clusterReferences = this.localConfig.configuration.clusterRefs;
        const deployments = this.localConfig.configuration.deployments;
        const context = clusterReferences.get(clusterReference);

        if (!context) {
          throw new Error(`Cluster "${clusterReference}" not found in the LocalConfig`);
        }

        const deploymentsWithSelectedCluster = Object.entries(deployments)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, deployment]) => deployment.clusters.includes(clusterReference))
          .map(([deploymentName, deployment]) => ({
            name: deploymentName,
            namespace: deployment.namespace || 'default',
          }));

        task.output =
          `Cluster Reference: ${clusterReference}\n` +
          `Associated Context: ${context}\n` +
          'Deployments using this Cluster:';

        task.output +=
          deploymentsWithSelectedCluster.length > 0
            ? '\n' +
              deploymentsWithSelectedCluster.map(dep => `  - ${dep.name} [Namespace: ${dep.namespace}]`).join('\n')
            : '\n  - None';

        this.logger.showUser(task.output);
      },
    };
  }

  public installMinioOperator(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    return {
      title: 'Install MinIO Operator chart',
      task: async ({config: {clusterSetupNamespace, context}}): Promise<void> => {
        const {exists: isMinioInstalled}: ReleaseNameData = await this.findMinioOperator(context);

        if (isMinioInstalled) {
          this.logger.showUser('⏭️  MinIO Operator chart already installed, skipping');
          return;
        }

        try {
          await this.chartManager.install(
            clusterSetupNamespace,
            constants.MINIO_OPERATOR_RELEASE_NAME,
            constants.MINIO_OPERATOR_CHART,
            constants.MINIO_OPERATOR_CHART,
            versions.MINIO_OPERATOR_VERSION,
            '--set operator.replicaCount=1',
            context,
          );

          this.logger.showUser('✅ MinIO Operator chart installed successfully');
        } catch (error) {
          this.logger.debug('Error installing MinIO Operator chart', error);
          try {
            await this.chartManager.uninstall(clusterSetupNamespace, constants.MINIO_OPERATOR_RELEASE_NAME, context);
          } catch (uninstallError) {
            this.logger.showUserError(uninstallError);
          }
          throw new SoloError('Error installing MinIO Operator chart', error);
        }
      },
      skip: ({config: {deployMinio}}): boolean => !deployMinio,
    };
  }

  public installPrometheusStack(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Install Prometheus Stack chart',
      task: async context_ => {
        const clusterSetupNamespace = context_.config.clusterSetupNamespace;

        const isPrometheusInstalled = await this.chartManager.isChartInstalled(
          clusterSetupNamespace,
          constants.PROMETHEUS_RELEASE_NAME,
          context_.config.context,
        );

        if (isPrometheusInstalled) {
          self.logger.showUser('⏭️  Prometheus Stack chart already installed, skipping');
        } else {
          try {
            await this.chartManager.install(
              clusterSetupNamespace,
              constants.PROMETHEUS_RELEASE_NAME,
              constants.PROMETHEUS_STACK_CHART,
              constants.PROMETHEUS_STACK_CHART,
              versions.PROMETHEUS_STACK_VERSION,
              '',
              context_.config.context,
            );
            self.logger.showUser('✅ Prometheus Stack chart installed successfully');
          } catch (error) {
            self.logger.debug('Error installing Prometheus Stack chart', error);
            try {
              await this.chartManager.uninstall(
                clusterSetupNamespace,
                constants.PROMETHEUS_RELEASE_NAME,
                context_.config.context,
              );
            } catch (uninstallError) {
              this.logger.showUserError(uninstallError);
            }
            throw new SoloError('Error installing Prometheus Stack chart', error);
          }
        }
      },
      skip: context_ => !context_.config.deployPrometheusStack,
    };
  }

  public installGrafanaAgent(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Install Grafana Agent chart',
      task: async context_ => {
        const clusterSetupNamespace = context_.config.clusterSetupNamespace;

        const isGrafanaAgentInstalled = await this.chartManager.isChartInstalled(
          clusterSetupNamespace,
          constants.GRAFANA_AGENT_RELEASE_NAME,
          context_.config.context,
        );

        if (isGrafanaAgentInstalled) {
          self.logger.showUser('⏭️  Grafana Agent chart already installed, skipping');
        } else {
          try {
            await this.chartManager.install(
              clusterSetupNamespace,
              constants.GRAFANA_AGENT_RELEASE_NAME,
              constants.GRAFANA_AGENT_CHART,
              constants.GRAFANA_AGENT_CHART,
              versions.GRAFANA_AGENT_VERSION,
              '',
              context_.config.context,
            );
            self.logger.showUser('✅ Grafana Agent chart installed successfully');
          } catch (error) {
            self.logger.debug('Error installing Grafana Agent chart', error);
            try {
              await this.chartManager.uninstall(
                clusterSetupNamespace,
                constants.GRAFANA_AGENT_RELEASE_NAME,
                context_.config.context,
              );
            } catch (uninstallError) {
              this.logger.showUserError(uninstallError);
            }
            throw new SoloError('Error installing Grafana Agent chart', error);
          }
        }
      },
      skip: context_ => !context_.config.deployGrafanaAgent,
    };
  }

  public installPodMonitorRole(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Install pod-monitor-role ClusterRole',
      task: async context_ => {
        const k8 = this.k8Factory.getK8(context_.config.context);

        try {
          // Check if ClusterRole already exists using Kubernetes JavaScript API
          await k8.rbac().readClusterRole(constants.POD_MONITOR_ROLE);
          self.logger.showUser('⏭️  ClusterRole pod-monitor-role already exists, skipping');
        } catch {
          // ClusterRole doesn't exist, create it
          try {
            const yamlContent = fs.readFileSync(constants.POD_MONITOR_ROLE_TEMPLATE, 'utf8');
            const clusterRole = yaml.parse(yamlContent);

            await k8.rbac().createClusterRole(clusterRole);
            self.logger.showUser('✅ ClusterRole pod-monitor-role installed successfully');
          } catch (installError) {
            self.logger.debug('Error installing pod-monitor-role ClusterRole', installError);
            throw new SoloError('Error installing pod-monitor-role ClusterRole', installError);
          }
        }
      },
    };
  }

  public uninstallPodMonitorRole(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Uninstall pod-monitor-role ClusterRole',
      task: async context_ => {
        const k8 = this.k8Factory.getK8(context_.config.context);

        try {
          // Check if ClusterRole exists using Kubernetes JavaScript API
          await k8.rbac().readClusterRole(constants.POD_MONITOR_ROLE);

          // ClusterRole exists, delete it
          await k8.rbac().deleteClusterRole(constants.POD_MONITOR_ROLE);
          self.logger.showUser('✅ ClusterRole pod-monitor-role uninstalled successfully');
        } catch {
          // ClusterRole doesn't exist, skip
          self.logger.showUser('⏭️  ClusterRole pod-monitor-role not found, skipping');
        }
      },
    };
  }

  public installClusterChart(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Install cluster charts',
      task: async (context_, task) => {
        // Always install pod-monitor-role ClusterRole first
        const subtasks = [this.installPodMonitorRole(argv)];

        if (context_.config.deployMinio) {
          subtasks.push(this.installMinioOperator(argv));
        }

        if (context_.config.deployPrometheusStack) {
          subtasks.push(this.installPrometheusStack(argv));
        }

        if (context_.config.deployGrafanaAgent) {
          subtasks.push(this.installGrafanaAgent(argv));
        } else {
          console.log('Skipping Grafana Agent chart installation');
        }

        const result = await task.newListr(subtasks, {concurrent: false});

        if (argv.dev) {
          await this.showInstalledChartList(context_.config.clusterSetupNamespace, context_.config.context);
        }
        return result;
      },
    };
  }

  public acquireNewLease(): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Acquire new lease',
      task: async (_, task) => {
        const lease: Lock = await this.leaseManager.create();
        return ListrLock.newAcquireLockTask(lease, task);
      },
    };
  }

  public uninstallMinioOperator(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Uninstall MinIO Operator chart',
      task: async ({config: {clusterSetupNamespace: namespace, context}}): Promise<void> => {
        const {exists: isMinioInstalled, releaseName}: ReleaseNameData = await this.findMinioOperator(context);

        if (isMinioInstalled) {
          await this.chartManager.uninstall(namespace, releaseName, context);

          this.logger.showUser('✅ MinIO Operator chart uninstalled successfully');
        } else {
          this.logger.showUser('⏭️  MinIO Operator chart not installed, skipping');
        }
      },
    };
  }

  public uninstallPrometheusStack(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Uninstall Prometheus Stack chart',
      task: async context_ => {
        const clusterSetupNamespace = context_.config.clusterSetupNamespace;

        const isPrometheusInstalled = await this.chartManager.isChartInstalled(
          clusterSetupNamespace,
          constants.PROMETHEUS_RELEASE_NAME,
          context_.config.context,
        );

        if (isPrometheusInstalled) {
          await self.chartManager.uninstall(
            clusterSetupNamespace,
            constants.PROMETHEUS_RELEASE_NAME,
            context_.config.context || this.k8Factory.default().contexts().readCurrent(),
          );
          self.logger.showUser('✅ Prometheus Stack chart uninstalled successfully');
        } else {
          self.logger.showUser('⏭️  Prometheus Stack chart not installed, skipping');
        }
      },
    };
  }

  public uninstallGrafanaAgent(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Uninstall Grafana Agent chart',
      task: async context_ => {
        const clusterSetupNamespace = context_.config.clusterSetupNamespace;

        const isGrafanaAgentInstalled = await this.chartManager.isChartInstalled(
          clusterSetupNamespace,
          constants.GRAFANA_AGENT_RELEASE_NAME,
          context_.config.context,
        );

        if (isGrafanaAgentInstalled) {
          await self.chartManager.uninstall(
            clusterSetupNamespace,
            constants.GRAFANA_AGENT_RELEASE_NAME,
            context_.config.context || this.k8Factory.default().contexts().readCurrent(),
          );
          self.logger.showUser('✅ Grafana Agent chart uninstalled successfully');
        } else {
          self.logger.showUser('⏭️  Grafana Agent chart not installed, skipping');
        }
      },
    };
  }

  public uninstallClusterChart(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Uninstall cluster charts',
      task: async (context_, task) => {
        const clusterSetupNamespace = context_.config.clusterSetupNamespace;

        if (!argv.force && (await self.clusterChecks.isRemoteConfigPresentInAnyNamespace())) {
          const confirm = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
            default: false,
            message:
              'There is remote config for one of the deployments' +
              'Are you sure you would like to uninstall the cluster?',
          });

          if (!confirm) {
            throw new UserBreak('Aborted application by user prompt');
          }
        }

        const subtasks = [
          this.uninstallGrafanaAgent(argv),
          this.uninstallPrometheusStack(argv),
          this.uninstallMinioOperator(argv),
          this.uninstallPodMonitorRole(argv),
        ];

        const result = await task.newListr(subtasks, {concurrent: false});

        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }

        return result;
      },
    };
  }
}
