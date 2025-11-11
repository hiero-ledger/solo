// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import {checkDockerImageExists, showVersionBanner, sleep} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  type DeploymentName,
  type Optional,
  type SoloListr,
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
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {gte, lt, SemVer} from 'semver';
import {injectable} from 'tsyringe-neo';
import {Templates} from '../core/templates.js';
import {K8} from '../integration/kube/k8.js';
import {BLOCK_NODE_IMAGE_NAME} from '../core/constants.js';
import {Version} from '../business/utils/version.js';
import {MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT} from '../../version.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';

interface BlockNodeDeployConfigClass {
  chartVersion: string;
  chartDirectory: string;
  blockNodeChartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  domainName: Optional<string>;
  enableIngress: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  releaseTag: string;
  imageTag: Optional<string>;
  namespace: NamespaceName;
  nodeAliases: NodeAliases; // from remote config
  context: string;
  valuesArg: string;
  newBlockNodeComponent: BlockNodeStateSchema;
  releaseName: string;
  livenessCheckPort: number;
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
  id: number;
  isLegacyChartInstalled: boolean;
}

interface BlockNodeDestroyContext {
  config: BlockNodeDestroyConfigClass;
}

interface BlockNodeUpgradeConfigClass {
  chartDirectory: string;
  blockNodeChartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  context: string;
  releaseName: string;
  upgradeVersion: string;
  valuesArg: string;
  id: number;
  isLegacyChartInstalled: boolean;
}

interface BlockNodeUpgradeContext {
  config: BlockNodeUpgradeConfigClass;
}

@injectable()
export class BlockNodeCommand extends BaseCommand {
  public constructor() {
    super();
  }

  private static readonly ADD_CONFIGS_NAME: string = 'addConfigs';

  private static readonly DESTROY_CONFIGS_NAME: string = 'destroyConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  public static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.blockNodeChartVersion,
      flags.blockNodeChartDirectory,
      flags.chartDirectory,
      flags.clusterRef,
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
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.devMode, flags.force, flags.quiet, flags.id],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.chartDirectory,
      flags.blockNodeChartDirectory,
      flags.clusterRef,
      flags.devMode,
      flags.force,
      flags.quiet,
      flags.valuesFile,
      flags.upgradeVersion,
      flags.id,
    ],
  };

  private async prepareValuesArgForBlockNode(
    config: BlockNodeDeployConfigClass | BlockNodeUpgradeConfigClass,
  ): Promise<string> {
    let valuesArgument: string = '';

    valuesArgument += helpers.prepareValuesFiles(constants.BLOCK_NODE_VALUES_FILE);

    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: config.releaseName});

    // Only handle domainName and imageTag for deploy config (not upgrade config)
    if ('domainName' in config && config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    if ('imageTag' in config && config.imageTag) {
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

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.BlockNode),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.BLOCK_NODE_RELEASE_NAME}-${id}`;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks: SoloListr<BlockNodeDeployContext> = this.taskList.newTaskList<BlockNodeDeployContext>(
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

            const config: BlockNodeDeployConfigClass = this.configManager.getConfig(
              BlockNodeCommand.ADD_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDeployConfigClass;

            context_.config = config;

            // check if block node version compatible with current hedera platform version
            let consensusNodeVersion: string = this.remoteConfig.configuration.versions.consensusNode.toString();
            if (consensusNodeVersion === '0.0.0') {
              // if is possible block node deployed before consensus node, then use release tag as fallback
              consensusNodeVersion = config.releaseTag;
            }
            if (
              lt(
                new SemVer(consensusNodeVersion),
                new SemVer(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE_LEGACY_RELEASE),
              )
            ) {
              throw new SoloError(
                `Current version is ${consensusNodeVersion}, Hedera platform versions less than ${versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE_LEGACY_RELEASE} are not supported`,
              );
            }

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            config.nodeAliases = this.remoteConfig.getConsensusNodes().map((node): NodeAlias => node.name);

            const currentBlockNodeVersion: SemVer = new SemVer(config.chartVersion);
            if (
              lt(
                new SemVer(consensusNodeVersion),
                new SemVer(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE),
              ) &&
              gte(currentBlockNodeVersion, MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT)
            ) {
              throw new SoloError(
                `Current platform version is ${consensusNodeVersion}, Hedera platform version less than ${versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_BLOCK_NODE} ` +
                  `are not supported for block node version ${MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT.version}`,
              );
            }

            config.chartVersion = Version.getValidSemanticVersion(
              config.chartVersion,
              false,
              'Block node chart version',
            );

            config.livenessCheckPort = this.getLivenessCheckPortNumber(config.chartVersion, config.imageTag);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Prepare release name and block node name',
          task: async ({config}): Promise<void> => {
            config.releaseName = this.getReleaseName();

            config.newBlockNodeComponent = this.componentFactory.createNewBlockNodeComponent(
              config.clusterRef,
              config.namespace,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            config.valuesArg = await this.prepareValuesArgForBlockNode(config);
          },
        },
        {
          title: 'Deploy block node',
          task: async ({config}, task): Promise<void> => {
            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              constants.BLOCK_NODE_CHART,
              config.blockNodeChartDirectory || constants.BLOCK_NODE_CHART_URL,
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
            showVersionBanner(this.logger, config.releaseName, config.chartVersion);

            await this.updateBlockNodeVersionInRemoteConfig(config);
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
                Templates.renderBlockNodeLabels(config.newBlockNodeComponent.metadata.id),
                constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                constants.BLOCK_NODE_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check software',
          task: async ({config}): Promise<void> => {
            const labels: string[] = Templates.renderBlockNodeLabels(config.newBlockNodeComponent.metadata.id);

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
                  Templates.renderBlockNodeLabels(config.newBlockNodeComponent.metadata.id),
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
        fallbackRendererOptions: {
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
      undefined,
      'block node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error deploying block node: ${error.message}`, error);
      } finally {
        await lease?.release();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks: SoloListr<BlockNodeDestroyContext> = this.taskList.newTaskList<BlockNodeDestroyContext>(
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

            const config: BlockNodeDestroyConfigClass = this.configManager.getConfig(
              BlockNodeCommand.DESTROY_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDestroyConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            const {id, releaseName, isChartInstalled, isLegacyChartInstalled} = await this.inferDestroyData(
              config.id,
              config.namespace,
              config.context,
            );

            config.id = id;
            config.releaseName = releaseName;
            config.isChartInstalled = isChartInstalled;
            config.isLegacyChartInstalled = isLegacyChartInstalled;

            await this.throwIfNamespaceIsMissing(config.context, config.namespace);

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy block node',
          task: async ({config: {namespace, releaseName, context}}): Promise<void> => {
            await this.chartManager.uninstall(namespace, releaseName, context);

            const podReferences: PodReference[] = await this.k8Factory
              .getK8(context)
              .pvcs()
              .list(namespace, [`app.kubernetes.io/instance=${releaseName}`])
              .then((pvcs): PvcName[] => pvcs.map((pvc): PvcName => PvcName.of(pvc)))
              .then((names): PodReference[] => names.map((pvc): PodReference => PvcReference.of(namespace, pvc)));

            for (const podReference of podReferences) {
              await this.k8Factory.getK8(context).pvcs().delete(podReference);
            }
          },
          skip: ({config}): boolean => !config.isChartInstalled,
        },
        this.removeBlockNodeComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        fallbackRendererOptions: {
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
      undefined,
      'block node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error destroying block node: ${error.message}`, error);
      } finally {
        await lease?.release();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
      });
    }

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<BlockNodeUpgradeContext> = this.taskList.newTaskList<BlockNodeUpgradeContext>(
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

            const config: BlockNodeUpgradeConfigClass = this.configManager.getConfig(
              BlockNodeCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeUpgradeConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            config.id = this.inferBlockNodeId(config.id);

            config.isLegacyChartInstalled = await this.checkIfLegacyChartIsInstalled(
              config.id,
              config.namespace,
              config.context,
            );

            config.releaseName = config.isLegacyChartInstalled
              ? `${constants.BLOCK_NODE_RELEASE_NAME}-0`
              : this.renderReleaseName(config.id);

            config.context = this.remoteConfig.getClusterRefs()[config.clusterRef];

            if (!config.upgradeVersion) {
              config.upgradeVersion = versions.BLOCK_NODE_VERSION;
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Look-up block node',
          task: async ({config}): Promise<void> => {
            try {
              this.remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(
                ComponentTypes.BlockNode,
                config.id,
              );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} was not found`, error);
            }
          },
        },
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            config.valuesArg = await this.prepareValuesArgForBlockNode(config);
          },
        },
        {
          title: 'Update block node chart',
          task: async ({config}): Promise<void> => {
            const {namespace, releaseName, context, upgradeVersion} = config;

            const validatedUpgradeVersion: string = Version.getValidSemanticVersion(
              upgradeVersion,
              false,
              'Block node chart version',
            );

            await this.chartManager.upgrade(
              namespace,
              releaseName,
              constants.BLOCK_NODE_CHART,
              config.blockNodeChartDirectory || constants.BLOCK_NODE_CHART_URL,
              validatedUpgradeVersion,
              config.valuesArg,
              context,
              false,
            );

            showVersionBanner(this.logger, constants.BLOCK_NODE_CHART, config.upgradeVersion);

            await this.updateBlockNodeVersionInRemoteConfig(config);
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        fallbackRendererOptions: {
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
      undefined,
      'block node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error upgrading block node: ${error.message}`, error);
      } finally {
        await lease?.release();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
      });
    }

    return true;
  }

  /**
   * Gives the port used for liveness check based on the chart version and image tag (if set)
   */
  private getLivenessCheckPortNumber(chartVersion: string | SemVer, imageTag: Optional<string | SemVer>): number {
    let useLegacyPort: boolean = false;

    chartVersion = typeof chartVersion === 'string' ? new SemVer(chartVersion) : chartVersion;
    imageTag = typeof imageTag === 'string' && imageTag ? new SemVer(imageTag) : undefined;

    if (lt(chartVersion, versions.MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT)) {
      useLegacyPort = true;
    } else if (imageTag && lt(imageTag, versions.MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_NEW_LIVENESS_CHECK_PORT)) {
      useLegacyPort = true;
    }

    return useLegacyPort ? constants.BLOCK_NODE_PORT_LEGACY : constants.BLOCK_NODE_PORT;
  }

  private async updateBlockNodeVersionInRemoteConfig(
    config: BlockNodeDeployConfigClass | BlockNodeUpgradeConfigClass,
  ): Promise<void> {
    let blockNodeVersion: SemVer;
    let imageTag: SemVer | undefined;

    if (config.hasOwnProperty('upgradeVersion') && (config as BlockNodeUpgradeConfigClass).upgradeVersion) {
      const version: string = (config as BlockNodeUpgradeConfigClass).upgradeVersion;
      blockNodeVersion = typeof version === 'string' ? new SemVer(version) : version;
    }

    if (config.hasOwnProperty('chartVersion') && (config as BlockNodeDeployConfigClass).chartVersion) {
      const version: string = (config as BlockNodeDeployConfigClass).chartVersion;
      blockNodeVersion = typeof version === 'string' ? new SemVer(version) : version;
    }

    if (config.hasOwnProperty('imageTag') && (config as BlockNodeDeployConfigClass).imageTag) {
      const tag: string = (config as BlockNodeDeployConfigClass).imageTag;
      imageTag = typeof tag === 'string' ? new SemVer(tag) : tag;
    }

    const finalVersion: SemVer = imageTag && lt(blockNodeVersion, imageTag) ? imageTag : blockNodeVersion;
    this.remoteConfig.updateComponentVersion(ComponentTypes.BlockNode, finalVersion);

    await this.remoteConfig.persist();
  }

  /** Adds the block node component to remote config. */
  private addBlockNodeComponent(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          config.newBlockNodeComponent,
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
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.BlockNode);

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
          .list(config.namespace, Templates.renderBlockNodeLabels(config.newBlockNodeComponent.metadata.id))
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
                .execContainer(['bash', '-c', `curl -s http://localhost:${config.livenessCheckPort}/healthz/readyz`]),
              Duration.ofSeconds(constants.BLOCK_NODE_ACTIVE_TIMEOUT),
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

  private inferBlockNodeId(id: Optional<ComponentId>): ComponentId {
    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.blockNodes.length === 0) {
      throw new SoloError('Block node not found in remote config');
    }

    return this.remoteConfig.configuration.components.state.blockNodes[0].metadata.id;
  }

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<boolean> {
    return id === 1
      ? await this.chartManager.isChartInstalled(namespace, `${constants.BLOCK_NODE_RELEASE_NAME}-0`, context)
      : false;
  }

  private async inferDestroyData(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    id: ComponentId;
    releaseName: string;
    isChartInstalled: boolean;
    isLegacyChartInstalled: boolean;
  }> {
    id = this.inferBlockNodeId(id);
    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(id, namespace, context);

    if (isLegacyChartInstalled) {
      return {
        id,
        releaseName: `${constants.BLOCK_NODE_RELEASE_NAME}-0`,
        isChartInstalled: true,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      isLegacyChartInstalled,
    };
  }
}
