// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import {checkDockerImageExists, showVersionBanner, sleep} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type AnyListrContext, type ArgvStruct, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {
  type ClusterReferenceName,
  ComponentId,
  type DeploymentName,
  type Optional,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import * as versions from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Duration} from '../core/time/duration.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import chalk from 'chalk';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {lt, SemVer} from 'semver';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';
import {MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE} from '../../version.js';
import {K8} from '../integration/kube/k8.js';
import {BLOCK_NODE_IMAGE_NAME} from '../core/constants.js';
import {Version} from '../business/utils/version.js';

interface BlockNodeDeployConfigClass {
  chartVersion: string;
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  domainName: Optional<string>;
  enableIngress: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  releaseTag: string;
  imageTag: string;
  namespace: NamespaceName;
  nodeAliases: NodeAliases; // from remote config
  context: string;
  valuesArg: string;
  releaseName: string;
}

interface BlockNodeDeployContext {
  config: BlockNodeDeployConfigClass;
}

interface BlockNodeDestroyConfigClass {
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
}

interface BlockNodeDestroyContext {
  config: BlockNodeDestroyConfigClass;
}

interface BlockNodeUpgradeConfigClass {
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  releaseName: string;
  upgradeVersion: string;
}

interface BlockNodeUpgradeContext {
  config: BlockNodeUpgradeConfigClass;
}

@injectable()
export class BlockNodeCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi) {
    super();
  }

  private static readonly ADD_CONFIGS_NAME: string = 'addConfigs';

  private static readonly DESTROY_CONFIGS_NAME: string = 'destroyConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  public static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.blockNodeChartVersion,
      flags.chartDirectory,
      flags.clusterRef,
      flags.deployment,
      flags.devMode,
      flags.domainName,
      flags.enableIngress,
      flags.quiet,
      flags.valuesFile,
      flags.releaseTag,
      flags.imageTag,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.chartDirectory, flags.clusterRef, flags.deployment, flags.devMode, flags.force, flags.quiet],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [flags.upgradeVersion],
    optional: [flags.chartDirectory, flags.clusterRef, flags.deployment, flags.devMode, flags.force, flags.quiet],
  };

  private async prepareValuesArgForBlockNode(config: BlockNodeDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    valuesArgument += helpers.prepareValuesFiles(constants.BLOCK_NODE_VALUES_FILE);

    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: config.releaseName});

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    if (config.imageTag) {
      config.imageTag = Version.getValidSemanticVersion(config.imageTag, false, 'Block node image tag');
      if (!checkDockerImageExists(BLOCK_NODE_IMAGE_NAME, config.imageTag)) {
        throw new SoloError(`Local block node image with tag "${config.imageTag}" does not exist.`);
      }
      // use local image from docker engine
      valuesArgument += helpers.populateHelmArguments({
        'image.repository': BLOCK_NODE_IMAGE_NAME,
        'image.tag': config.imageTag,
        'image.pullPolicy': 'Never',
      });
    }

    return valuesArgument;
  }

  private getNextReleaseName(): string {
    return (
      constants.BLOCK_NODE_RELEASE_NAME +
      '-' +
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.BlockNode)
    );
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks: Listr<BlockNodeDeployContext> = new Listr<BlockNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.ADD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.ADD_FLAGS_LIST.required,
              ...BlockNodeCommand.ADD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              BlockNodeCommand.ADD_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDeployConfigClass;

            const platformVersion: SemVer = new SemVer(context_.config.releaseTag);
            if (lt(platformVersion, new SemVer(MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE))) {
              throw new SoloError(
                `Hedera platform versions less than ${MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE} are not supported`,
              );
            }

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            context_.config.nodeAliases = this.remoteConfig.getConsensusNodes().map((node): NodeAlias => node.name);

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            context_.config.context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Prepare release name',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.releaseName = this.getNextReleaseName();
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.valuesArg = await this.prepareValuesArgForBlockNode(config);
          },
        },
        {
          title: 'Deploy block node',
          task: async (context_, task): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.chartVersion = Version.getValidSemanticVersion(
              config.chartVersion,
              false,
              'Block node chart version',
            );

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              constants.BLOCK_NODE_CHART,
              constants.BLOCK_NODE_CHART_URL,
              config.chartVersion,
              config.valuesArg,
              config.context,
            );

            if (config.imageTag) {
              // update config map with new VERSION info since
              // it will be used as a critical environment variable by block node
              const blockNodeStateSchema: BlockNodeStateSchema = this.componentFactory.createNewBlockNodeComponent(
                config.clusterRef,
                config.namespace,
              );
              const blockNodeId: ComponentId = blockNodeStateSchema.metadata.id;
              const k8: K8 = this.k8Factory.getK8(config.context);
              await k8.configMaps().update(config.namespace, `block-node-${blockNodeId}-config`, {
                VERSION: config.imageTag,
              });
              task.title += ` with local built image (${config.imageTag})`;
            }
            showVersionBanner(this.logger, config.releaseName, versions.BLOCK_NODE_VERSION);
          },
        },
        {
          title: 'Check block node pod is running',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                [`app.kubernetes.io/instance=${config.releaseName}`],
                constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                constants.BLOCK_NODE_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check software',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            const labels: string[] = [`app.kubernetes.io/instance=${config.releaseName}`];

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
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  [`app.kubernetes.io/instance=${config.releaseName}`],
                  constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.BLOCK_NODE_PODS_RUNNING_DELAY,
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

    const tasks: Listr<BlockNodeDestroyContext> = new Listr<BlockNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.DESTROY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.DESTROY_FLAGS_LIST.required,
              ...BlockNodeCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              BlockNodeCommand.DESTROY_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDestroyConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            context_.config.context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];

            const existingBlockNodeComponents: BlockNodeStateSchema[] =
              this.remoteConfig.configuration.components.getComponentsByClusterReference<BlockNodeStateSchema>(
                ComponentTypes.BlockNode,
                context_.config.clusterRef,
              );

            // check if any of the block node components are installed
            for (const blockNodeComponent of existingBlockNodeComponents) {
              const releaseName: string = constants.BLOCK_NODE_RELEASE_NAME + '-' + blockNodeComponent.metadata.id;
              const installed: boolean = await this.chartManager.isChartInstalled(
                context_.config.namespace,
                releaseName,
                context_.config.context,
              );
              if (installed) {
                context_.config.isChartInstalled = installed;
                context_.config.releaseName = releaseName;
                break;
              }
            }

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Look-up block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDestroyConfigClass = context_.config;
            try {
              // TODO: Add support for multiple block nodes
              this.remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(
                ComponentTypes.BlockNode,
                0,
              );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} was not found`, error);
            }
          },
        },
        {
          title: 'Destroy block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDestroyConfigClass = context_.config;

            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
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

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: Listr<BlockNodeUpgradeContext> = new Listr<BlockNodeUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.UPGRADE_FLAGS_LIST.required,
              ...BlockNodeCommand.UPGRADE_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              BlockNodeCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeUpgradeConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            context_.config.releaseName = `${constants.BLOCK_NODE_RELEASE_NAME}-0`;

            context_.config.context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Look-up block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeUpgradeConfigClass = context_.config;
            try {
              // TODO: Add support for multiple block nodes
              this.remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(
                ComponentTypes.BlockNode,
                0,
              );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} was not found`, error);
            }
          },
        },
        {
          title: 'Update block node chart',
          task: async (context_): Promise<void> => {
            const {namespace, releaseName, context, upgradeVersion} = context_.config;

            const validatedUpgradeVersion = Version.getValidSemanticVersion(
              upgradeVersion,
              false,
              'Block node chart version',
            );

            await this.chartManager.upgrade(
              namespace,
              releaseName,
              constants.BLOCK_NODE_CHART,
              constants.BLOCK_NODE_CHART_URL,
              validatedUpgradeVersion,
              '',
              context,
            );
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error upgrading block node: ${error.message}`, error);
    } finally {
      await lease?.release();
    }

    return true;
  }

  /** Adds the block node component to remote config. */
  private addBlockNodeComponent(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        const {namespace, clusterRef} = context_.config;
        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewBlockNodeComponent(clusterRef, namespace),
          ComponentTypes.BlockNode,
        );

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the block node component to remote config. */
  private removeBlockNodeComponent(): SoloListrTask<BlockNodeDestroyContext> {
    return {
      title: 'Disable block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (): Promise<void> => {
        // TODO: Add support for multiple block nodes
        this.remoteConfig.configuration.components.removeComponent(0, ComponentTypes.BlockNode);

        await this.remoteConfig.persist();
      },
    };
  }

  private displayHealthCheckData(
    task: SoloListrTaskWrapper<BlockNodeDeployContext>,
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

  private checkBlockNodeReadiness(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Check block node readiness',
      task: async (context_, task): Promise<void> => {
        const config: BlockNodeDeployConfigClass = context_.config;

        const displayHealthcheckCallback: (
          attempt: number,
          maxAttempt: number,
          color?: 'yellow' | 'green' | 'red',
          additionalData?: string,
        ) => void = this.displayHealthCheckData(task);

        const blockNodePodReference: PodReference = await this.k8Factory
          .getK8(config.context)
          .pods()
          .list(config.namespace, [`app.kubernetes.io/instance=${config.releaseName}`])
          .then((pods: Pod[]): PodReference => pods[0].podReference);

        const containerReference: ContainerReference = ContainerReference.of(
          blockNodePodReference,
          constants.BLOCK_NODE_CONTAINER_NAME,
        );

        const maxAttempts: number = constants.BLOCK_NODE_ACTIVE_MAX_ATTEMPTS;
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
                .execContainer(['bash', '-c', 'curl -s http://localhost:8080/healthz/readyz']),
              Duration.ofMillis(constants.BLOCK_NODE_ACTIVE_TIMEOUT),
              'Healthcheck timed out',
            );

            if (response !== 'OK') {
              throw new SoloError('Bad response status');
            }

            success = true;
            break;
          } catch {
            // Guard
          }

          attempt++;
          await sleep(Duration.ofSeconds(constants.BLOCK_NODE_ACTIVE_DELAY));
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
}
