// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as helpers from '../core/helpers.js';
import * as constants from '../core/constants.js';

import chalk from 'chalk';
import {injectable} from 'tsyringe-neo';
import {checkDockerImageExists, isValidString, showVersionBanner, sleep} from '../core/helpers.js';

import {type Lock} from '../core/lock/lock.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type AnyListrContext, type ArgvStruct, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  type DeploymentName,
  type Optional,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Duration} from '../core/time/duration.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Templates} from '../core/templates.js';
import {Version} from '../business/utils/version.js';
import {TransactionToolStateSchema} from '../data/schema/model/remote/state/transaction-tool-state-schema.js';

interface TransactionToolAddConfigClass {
  chartVersion: string;
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  domainName: Optional<string>;
  quiet: boolean;
  valuesFile: Optional<string>;
  releaseTag: string;
  imageTag: Optional<string>;
  namespace: NamespaceName;
  nodeAliases: NodeAliases; // from remote config
  context: string;
  valuesArg: string;
  newTransactionToolComponent: TransactionToolStateSchema;
  releaseName: string;
}

interface TransactionToolAddContext {
  config: TransactionToolAddConfigClass;
}

interface TransactionToolDestroyConfigClass {
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  isChartInstalled: boolean;
  valuesArg: string;
  releaseName: string;
  id: number;
}

interface TransactionToolDestroyContext {
  config: TransactionToolDestroyConfigClass;
}

@injectable()
export class TransactionToolCommand extends BaseCommand {
  public constructor() {
    super();
  }

  private static readonly ADD_CONFIGS_NAME: string = 'addConfigs';

  private static readonly DESTROY_CONFIGS_NAME: string = 'destroyConfigs';

  public static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.transactionToolChartVersion,
      flags.chartDirectory,
      flags.clusterRef,
      flags.devMode,
      flags.domainName,
      flags.quiet,
      flags.valuesFile,
      flags.releaseTag,
      flags.imageTag,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.devMode, flags.force, flags.quiet, flags.id],
  };

  private async prepareValuesArgs(config: TransactionToolAddConfigClass): Promise<string> {
    let valuesArgument: string = ' --install ';

    valuesArgument += helpers.prepareValuesFiles(constants.TRANSACTION_TOOL_VALUES_FILE);

    if (isValidString(config.valuesFile)) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: config.releaseName});

    // Only handle domainName and imageTag for deploy config (not upgrade config)
    if (isValidString(config.domainName)) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    if (isValidString(config.imageTag)) {
      config.imageTag = Version.getValidSemanticVersion(config.imageTag, false, 'Block node image tag');

      if (!checkDockerImageExists(constants.TRANSACTION_TOOL_IMAGE_NAME, config.imageTag)) {
        throw new SoloError(`Local block node image with tag "${config.imageTag}" does not exist.`);
      }

      // use local image from docker engine
      valuesArgument += helpers.populateHelmArguments({
        'image.repository': constants.TRANSACTION_TOOL_IMAGE_NAME,
        'image.tag': config.imageTag,
        'image.pullPolicy': 'Never',
      });
    }

    return valuesArgument;
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.BlockNode),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.TRANSACTION_TOOL_RELEASE_NAME}-${id}`;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks: Listr<TransactionToolAddContext> = new Listr<TransactionToolAddContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(TransactionToolCommand.ADD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...TransactionToolCommand.ADD_FLAGS_LIST.required,
              ...TransactionToolCommand.ADD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: TransactionToolAddConfigClass = this.configManager.getConfig(
              TransactionToolCommand.ADD_CONFIGS_NAME,
              allFlags,
            ) as TransactionToolAddConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            config.nodeAliases = this.remoteConfig.getConsensusNodes().map((node): NodeAlias => node.name);

            config.chartVersion = Version.getValidSemanticVersion(
              config.chartVersion,
              false,
              'Block node chart version',
            );

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Prepare release name and block node name',
          task: async ({config}): Promise<void> => {
            config.releaseName = this.getReleaseName();

            config.newTransactionToolComponent = this.componentFactory.createNewBlockNodeComponent(
              config.clusterRef,
              config.namespace,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            config.valuesArg = await this.prepareValuesArgs(config);
          },
        },
        {
          title: 'Deploy transaction tool',
          task: async ({config}, task): Promise<void> => {
            await this.chartManager.upgrade(
              config.namespace,
              config.releaseName,
              constants.TRANSACTION_TOOL_CHART,
              config.chartDirectory ? config.chartDirectory : constants.TRANSACTION_TOOL_CHART_URL,
              config.chartVersion,
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, config.chartVersion);
          },
        },
        {
          title: 'Check block node pod is running',
          task: async ({config}): Promise<void> => {
            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                Templates.renderBlockNodeLabels(config.newTransactionToolComponent.metadata.id),
                constants.TRANSACTION_TOOL_PODS_RUNNING_MAX_ATTEMPTS,
                constants.TRANSACTION_TOOL_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check software',
          task: async ({config}): Promise<void> => {
            const labels: string[] = Templates.renderBlockNodeLabels(config.newTransactionToolComponent.metadata.id);

            const blockNodePods: Pod[] = await this.k8Factory
              .getK8(config.context)
              .pods()
              .list(config.namespace, labels);

            if (blockNodePods.length === 0) {
              throw new SoloError('Failed to list block node pod');
            }
          },
        },
        {
          title: 'Check block node pod is ready',
          task: async ({config}): Promise<void> => {
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  Templates.renderBlockNodeLabels(config.newTransactionToolComponent.metadata.id),
                  constants.TRANSACTION_TOOL_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.TRANSACTION_TOOL_PODS_RUNNING_DELAY,
                );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} is not ready: ${error.message}`, error);
            }
          },
        },
        this.checkBlockNodeReadiness(),
        this.addBlockNodeComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying block node: ${error.message}`, error);
    } finally {
      await lease?.release();
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks: Listr<TransactionToolDestroyContext> = new Listr<TransactionToolDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(TransactionToolCommand.DESTROY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...TransactionToolCommand.DESTROY_FLAGS_LIST.required,
              ...TransactionToolCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: TransactionToolDestroyConfigClass = this.configManager.getConfig(
              TransactionToolCommand.DESTROY_CONFIGS_NAME,
              allFlags,
            ) as TransactionToolDestroyConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            const {id, releaseName, isChartInstalled} = await this.inferDestroyData(
              config.id,
              config.namespace,
              config.context,
            );

            config.id = id;
            config.releaseName = releaseName;
            config.isChartInstalled = isChartInstalled;

            await this.throwIfNamespaceIsMissing(config.context, config.namespace);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy block node',
          task: async ({config}): Promise<void> => {
            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);
          },
          skip: ({config}): boolean => !config.isChartInstalled,
        },
        this.removeBlockNodeComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying block node: ${error.message}`, error);
    } finally {
      await lease?.release();
    }

    return true;
  }

  private addBlockNodeComponent(): SoloListrTask<TransactionToolAddContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          config.newTransactionToolComponent,
          ComponentTypes.BlockNode,
        );

        await this.remoteConfig.persist();
      },
    };
  }

  private removeBlockNodeComponent(): SoloListrTask<TransactionToolDestroyContext> {
    return {
      title: 'Disable block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.BlockNode);

        await this.remoteConfig.persist();
      },
    };
  }

  private displayHealthCheckData(
    task: SoloListrTaskWrapper<TransactionToolAddContext>,
  ): (attempt: number, maxAttempt: number, color?: 'yellow' | 'green' | 'red', additionalData?: string) => void {
    const baseTitle: string = task.title;

    return function (
      attempt: number,
      maxAttempt: number,
      color: 'yellow' | 'green' | 'red' = 'yellow',
      additionalData: string = '',
    ): void {
      task.title = `${baseTitle} - ${chalk[color](`[${attempt}/${maxAttempt}]`)} ${chalk[color](additionalData)}`;
    };
  }

  private checkBlockNodeReadiness(): SoloListrTask<TransactionToolAddContext> {
    return {
      title: 'Check block node readiness',
      task: async ({config}, task): Promise<void> => {
        const displayHealthcheckCallback: (
          attempt: number,
          maxAttempt: number,
          color?: 'yellow' | 'green' | 'red',
          additionalData?: string,
        ) => void = this.displayHealthCheckData(task);

        const blockNodePodReference: PodReference = await this.k8Factory
          .getK8(config.context)
          .pods()
          .list(config.namespace, Templates.renderBlockNodeLabels(config.newTransactionToolComponent.metadata.id))
          .then((pods: Pod[]): PodReference => pods[0].podReference);

        const containerReference: ContainerReference = ContainerReference.of(
          blockNodePodReference,
          constants.TRANSACTION_TOOL_CONTAINER_NAME,
        );

        const maxAttempts: number = constants.TRANSACTION_TOOL_ACTIVE_MAX_ATTEMPTS;
        let attempt: number = 1;
        let success: boolean = false;

        displayHealthcheckCallback(attempt, maxAttempts);

        while (attempt < maxAttempts) {
          try {
            const response: string = await helpers.withTimeout(
              this.k8Factory
                .getK8(config.context)
                .containers()
                .readByRef(containerReference)
                .execContainer([
                  'bash',
                  '-c',
                  `curl -s http://localhost:${constants.TRANSACTION_TOOL_PORT}/healthz/readyz`,
                ]),
              Duration.ofSeconds(constants.TRANSACTION_TOOL_ACTIVE_TIMEOUT),
              'Healthcheck timed out',
            );

            if (response !== 'OK') {
              throw new SoloError('Bad response status');
            }

            success = true;
            break;
          } catch (error) {
            this.logger.debug(
              `Waiting for block node health check to come back with OK status: ${error.message}, [attempts: ${attempt}/${maxAttempts}`,
            );
          }

          attempt++;
          await sleep(Duration.ofSeconds(constants.TRANSACTION_TOOL_ACTIVE_DELAY));
          displayHealthcheckCallback(attempt, maxAttempts);
        }

        if (!success) {
          displayHealthcheckCallback(attempt, maxAttempts, 'red', 'max attempts reached');
          throw new SoloError('Max attempts reached');
        }

        displayHealthcheckCallback(attempt, maxAttempts, 'green', 'success');
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private inferBlockNodeId(id: Optional<ComponentId>): ComponentId {
    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.blockNodes.length === 0) {
      throw new SoloError('Block node not found in remote config');
    }

    return this.remoteConfig.configuration.components.state.blockNodes[0].metadata.id;
  }

  private async inferDestroyData(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<{id: ComponentId; releaseName: string; isChartInstalled: boolean}> {
    id = this.inferBlockNodeId(id);

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
    };
  }
}
