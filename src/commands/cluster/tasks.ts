// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import {type AnyListrContext, type ArgvStruct, type ConfigBuilder} from '../../types/aliases.js';
import {showVersionBanner} from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import {SOLO_CLUSTER_SETUP_CHART} from '../../core/constants.js';
import chalk from 'chalk';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {ErrorMessages} from '../../core/error-messages.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {UserBreak} from '../../core/errors/user-break.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ClusterReferenceName, type SoloListrTask} from '../../types/index.js';
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
import {PathEx} from '../../business/utils/path-ex.js';
import {quote} from 'shell-quote';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {StringFacade} from '../../business/runtime-state/facade/string-facade.js';
import {Lock} from '../../core/lock/lock.js';
import {RemoteConfigRuntimeState} from '../../business/runtime-state/config/remote/remote-config-runtime-state.js';
import {Version} from '../../business/utils/version.js';

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

  /**
   * Prepare values arg for cluster setup command
   *
   * @param chartDirectory
   * @param [prometheusStackEnabled] - a bool to denote whether to install prometheus stack
   * @param [minioEnabled] - a bool to denote whether to install minio
   */
  private prepareValuesArg(
    chartDirectory = flags.chartDirectory.definition.defaultValue as string,
    prometheusStackEnabled = flags.deployPrometheusStack.definition.defaultValue as boolean,
    minioEnabled = flags.deployMinio.definition.defaultValue as boolean,
  ): string {
    let valuesArgument: string = '';
    if (chartDirectory) {
      // Safely construct the path and escape it for shell usage
      const valuesPath = PathEx.join(chartDirectory, 'solo-cluster-setup', 'values.yaml');
      valuesArgument = `-f ${quote([valuesPath])}`;
    }

    valuesArgument += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`;
    valuesArgument += ` --set cloud.minio.enabled=${minioEnabled}`;

    return valuesArgument;
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

  public prepareChartValues(): SoloListrTask<ClusterReferenceSetupContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Prepare chart values',
      task: async context_ => {
        // if minio is already present, don't deploy it
        if (
          context_.config.deployMinio &&
          (await self.clusterChecks.isMinioInstalled(context_.config.clusterSetupNamespace))
        ) {
          context_.config.deployMinio = false;
        }

        // if prometheus is found, don't deploy it
        if (
          context_.config.deployPrometheusStack &&
          (await self.clusterChecks.isPrometheusInstalled(context_.config.clusterSetupNamespace))
        ) {
          context_.config.deployPrometheusStack = false;
        }

        // If all are already present or not wanted, skip installation
        if (!context_.config.deployPrometheusStack && !context_.config.deployMinio) {
          // TODO: I think this will skip installing the RBAC role
          context_.isChartInstalled = true;
          return;
        }

        context_.valuesArg = this.prepareValuesArg(
          context_.config.chartDirectory,
          context_.config.deployPrometheusStack,
          context_.config.deployMinio,
        );
      },
      skip: context_ => context_.isChartInstalled,
    };
  }

  public installClusterChart(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      task: async context_ => {
        const clusterSetupNamespace = context_.config.clusterSetupNamespace;
        const version = Version.getValidSemanticVersion(context_.config.soloChartVersion, false, 'Solo chart version');
        const valuesArgument = context_.valuesArg;

        try {
          await this.chartManager.install(
            clusterSetupNamespace,
            constants.SOLO_CLUSTER_SETUP_CHART,
            constants.SOLO_CLUSTER_SETUP_CHART,
            context_.config.chartDirectory ? context_.config.chartDirectory : constants.SOLO_TESTING_CHART_URL,
            version,
            valuesArgument,
            context_.config.context,
          );
          showVersionBanner(self.logger, SOLO_CLUSTER_SETUP_CHART, version);
        } catch (error) {
          // if error, uninstall the chart and rethrow the error
          self.logger.debug(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            error,
          );
          try {
            await this.chartManager.uninstall(
              clusterSetupNamespace,
              constants.SOLO_CLUSTER_SETUP_CHART,
              context_.config.context,
            );
          } catch (error) {
            this.logger.showUserError(error);
          }

          throw new SoloError(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            error,
          );
        }

        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace, context_.config.context);
        }
      },
      skip: context_ => context_.isChartInstalled,
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

  public uninstallClusterChart(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
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
        await self.chartManager.uninstall(
          clusterSetupNamespace,
          constants.SOLO_CLUSTER_SETUP_CHART,
          this.k8Factory.default().contexts().readCurrent(),
        );
        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      skip: context_ => !context_.isChartInstalled,
    };
  }
}
