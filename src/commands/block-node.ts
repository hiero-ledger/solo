// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {
  createAndCopyBlockNodeJsonFileForConsensusNode,
  showVersionBanner,
  sleep,
  withTimeout,
} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct, type NodeAlias} from '../types/aliases.js';
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
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Duration} from '../core/time/duration.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import chalk from 'chalk';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {Templates} from '../core/templates.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {assertUpgradeVersionNotOlder} from '../core/upgrade-version-guard.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';
import {DeploymentStateSchema} from '../data/schema/model/remote/deployment-state-schema.js';
import {ConsensusNode} from '../core/model/consensus-node.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {ExternalBlockNodeStateSchema} from '../data/schema/model/remote/state/external-block-node-state-schema.js';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {
  ComponentUpgradeMigrationRules,
  type ComponentUpgradeMigrationStep,
} from './migrations/component-upgrade-rules.js';
import {optionFromFlag} from './command-helpers.js';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import {ImageReference, type ParsedImageReference} from '../business/utils/image-reference.js';
import {type SoloEventBus} from '../core/events/solo-event-bus.js';
import {BlockNodeDeployedEvent} from '../core/events/event-types/block-node-deployed-event.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {PathEx} from '../business/utils/path-ex.js';
import fs from 'node:fs';

interface BlockNodeDeployConfigClass {
  chartVersion: string;
  chartDirectory: string;
  blockNodeChartDirectory: string;
  blockNodeTssOverlay: boolean;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  domainName: Optional<string>;
  enableIngress: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  releaseTag: string;
  imageTag: Optional<string>;
  componentImage: Optional<string>;
  namespace: NamespaceName;
  context: string;
  chartValues: HelmChartValues;
  newBlockNodeComponent: BlockNodeStateSchema;
  releaseName: string;
  livenessCheckPort: number;
  priorityMapping: Record<NodeAlias, number>;
  blockNodeMessageSizeSoftLimitBytes: Optional<number>;
  blockNodeMessageSizeHardLimitBytes: Optional<number>;
}

interface BlockNodeDeployContext {
  config: BlockNodeDeployConfigClass;
}

interface BlockNodeDestroyConfigClass {
  chartDirectory: string;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  isChartInstalled: boolean;
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
  blockNodeTssOverlay: boolean;
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  context: string;
  releaseName: string;
  upgradeVersion: string;
  currentVersion: string;
  migrationPlan: ComponentUpgradeMigrationStep[];
  chartValues: HelmChartValues;
  id: number;
  isLegacyChartInstalled: boolean;
  /** Set by recreateBlockNodeChart; used by the readiness check to ignore the terminating predecessor pod. */
  recreateInstallTime?: Date;
}

interface BlockNodeUpgradeContext {
  config: BlockNodeUpgradeConfigClass;
}

interface BlockNodeAddExternalConfigClass {
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  context: string;
  externalBlockNodeAddress: string;
  newExternalBlockNodeComponent: ExternalBlockNodeStateSchema;
  namespace: NamespaceName;
  priorityMapping: Record<NodeAlias, number>;
  blockNodeMessageSizeSoftLimitBytes: Optional<number>;
  blockNodeMessageSizeHardLimitBytes: Optional<number>;
}

interface BlockNodeAddExternalContext {
  config: BlockNodeAddExternalConfigClass;
}

interface BlockNodeDeleteExternalConfigClass {
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  id: number;
}

interface BlockNodeDeleteExternalContext {
  config: BlockNodeDeleteExternalConfigClass;
}

interface BlockNodeCollectJfrConfigClass {
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  id: ComponentId;
}

interface BlockNodeCollectJfrContext {
  config: BlockNodeCollectJfrConfigClass;
}

interface InferredData {
  id: ComponentId;
  releaseName: string;
  isChartInstalled: boolean;
  isLegacyChartInstalled: boolean;
}

@injectable()
export class BlockNodeCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus) {
    super();
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
  }

  private static readonly ADD_CONFIGS_NAME: string = 'addConfigs';

  private static readonly DESTROY_CONFIGS_NAME: string = 'destroyConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  private static readonly ADD_EXTERNAL_CONFIGS_NAME: string = 'addExternalConfigs';

  private static readonly DELETE_CONFIGS_NAME: string = 'deleteExternalConfigs';

  private static readonly COLLECT_JFR_CONFIGS_NAME: string = 'collectJfrConfigs';

  // Sentinel printed by the in-pod consolidation script when no JFR recording is present.
  private static readonly NO_JFR_MARKER: string = 'SOLO_NO_JFR_RECORDING';
  private static readonly MIGRATION_COMPONENT_KEY: string = 'block-node';

  public static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      // Keep legacy flag visible as a separate deprecated option.
      flags.blockNodeChartVersion,
      flags.blockNodeVersion,
      flags.blockNodeChartDirectory,
      flags.blockNodeTssOverlay,
      flags.blockNodeMessageSizeSoftLimitBytes,
      flags.blockNodeMessageSizeHardLimitBytes,
      flags.chartDirectory,
      flags.clusterRef,
      flags.debugMode,
      flags.domainName,
      flags.enableIngress,
      flags.quiet,
      flags.valuesFile,
      // Keep deprecated legacy flag accepted for backward compatibility.
      flags.releaseTag,
      flags.consensusNodeVersion,
      flags.imageTag,
      flags.componentImage,
      flags.priorityMapping,
    ],
  };

  public static readonly ADD_EXTERNAL_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.externalBlockNodeAddress],
    optional: [
      flags.clusterRef,
      flags.debugMode,
      flags.quiet,
      flags.priorityMapping,
      flags.blockNodeMessageSizeSoftLimitBytes,
      flags.blockNodeMessageSizeHardLimitBytes,
    ],
  };

  public static readonly DELETE_EXTERNAL_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.clusterRef, flags.debugMode, flags.force, flags.quiet, flags.id],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.debugMode, flags.force, flags.quiet, flags.id],
  };

  public static readonly COLLECT_JFR_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.clusterRef, flags.debugMode, flags.quiet, flags.id],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.chartDirectory,
      flags.blockNodeChartDirectory,
      flags.clusterRef,
      flags.debugMode,
      flags.force,
      flags.quiet,
      flags.valuesFile,
      flags.upgradeVersion,
      flags.id,
    ],
  };

  /**
   * Persists the deployment-wide block node message-size overrides into remote config when provided.
   * BlockNodesJsonWrapper reads these when generating block-nodes.json for the consensus nodes; when
   * they are left undefined it falls back to the TSS config defaults.
   */
  private async persistBlockNodeMessageSizeOverrides(
    softLimitBytes: Optional<number>,
    hardLimitBytes: Optional<number>,
  ): Promise<void> {
    if (!this.remoteConfig.isLoaded()) {
      return;
    }

    const state: DeploymentStateSchema = this.remoteConfig.configuration.state;
    let changed: boolean = false;

    if (typeof softLimitBytes === 'number') {
      state.blockNodeMessageSizeSoftLimitBytes = softLimitBytes;
      changed = true;
    }
    if (typeof hardLimitBytes === 'number') {
      state.blockNodeMessageSizeHardLimitBytes = hardLimitBytes;
      changed = true;
    }

    if (changed) {
      await this.remoteConfig.persist();
    }
  }

  private async prepareValuesArgForBlockNode(
    config: BlockNodeDeployConfigClass | BlockNodeUpgradeConfigClass,
  ): Promise<HelmChartValues> {
    const chartValues: HelmChartValues = new HelmChartValues().file(constants.BLOCK_NODE_VALUES_FILE);

    // Block node can be deployed before consensus deploy persists tssEnabled into remote config.
    // The explicit CLI switch allows users to opt into TSS sizing and message limits in that order-of-operations.
    if (this.remoteConfig.configuration.state.tssEnabled || config.blockNodeTssOverlay) {
      chartValues.file(constants.BLOCK_NODE_TSS_VALUES_FILE);
    }

    chartValues.filesFromCommaSeparatedInput(config.valuesFile);

    chartValues.set('nameOverride', config.releaseName);

    // Only handle domainName for deploy config (not upgrade config)
    if ('domainName' in config && config.domainName) {
      chartValues
        .set('ingress.enabled', true)
        .set('ingress.hosts[0].host', config.domainName)
        .set('ingress.hosts[0].paths[0].path', '/')
        .set('ingress.hosts[0].paths[0].pathType', 'ImplementationSpecific');
    }

    if ('componentImage' in config && config.componentImage) {
      if (this.isLocalImageReference(config.componentImage)) {
        const {name: localImageName, tag: rawTag} = this.splitImageNameTag(config.componentImage);
        const localImageTag: string = SemanticVersion.getValidSemanticVersion(rawTag, false, 'Block node image tag');
        if (this.isLocalImageAvailableInDocker(`${localImageName}:${localImageTag}`)) {
          // Image found locally — kind-load task will load it; set pullPolicy: Never.
          chartValues
            .set('image.repository', localImageName)
            .set('image.tag', localImageTag)
            .set('image.pullPolicy', 'Never');
        } else {
          // Not in local Docker — plain tag override so K8s can pull from a registry.
          chartValues.set('image.tag', localImageTag);
        }
      } else {
        const parsedReference: ParsedImageReference = ImageReference.parseImageReference(config.componentImage);
        chartValues
          .setLiteral('image.registry', parsedReference.registry)
          .set('image.repository', parsedReference.repository)
          .set('image.tag', parsedReference.tag);
      }
    }

    const {state, clusters} = this.remoteConfig.configuration;

    const sourceBlockNodes: BlockNodeStateSchema[] =
      'newBlockNodeComponent' in config
        ? state.blockNodes.filter(
            (blockNode): boolean => blockNode.metadata.id !== config.newBlockNodeComponent.metadata.id,
          )
        : state.blockNodes;
    let sourceIndex: number = 0;

    for (const blockNode of sourceBlockNodes) {
      const cluster: ClusterSchema = clusters.find(({name}): boolean => name === blockNode.metadata.cluster);

      const fqdn: string = Templates.renderSvcFullyQualifiedDomainName(
        `block-node-${blockNode.metadata.id}`,
        config.namespace.name,
        cluster.dnsBaseDomain,
      );

      chartValues
        .set(`blockNode.backfill.sources[${sourceIndex}].address`, fqdn)
        .set(`blockNode.backfill.sources[${sourceIndex}].port`, constants.BLOCK_NODE_PORT)
        .set(`blockNode.backfill.sources[${sourceIndex}].priority`, 1);
      sourceIndex++;
    }

    return chartValues;
  }

  private static appendExtraCommandArgs(
    chartValues: HelmChartValues,
    extraCommandArguments: string[],
  ): HelmChartValues {
    if (extraCommandArguments.length === 0) {
      return chartValues;
    }
    return chartValues.clone().arguments(...extraCommandArguments);
  }

  private loadImageIntoKindTask(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Load local image into Kind cluster',
      skip: ({config}: BlockNodeDeployContext): boolean => {
        return !config.componentImage || !this.isLocalImageAvailableInDocker(config.componentImage);
      },
      task: async ({config}: BlockNodeDeployContext): Promise<void> => {
        await this.kindLoadComponentImage(config.componentImage, config.context);
      },
    };
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.BlockNode),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloErrors.validation.blockNodeInvalidComponentId(id);
    }
    return `${constants.BLOCK_NODE_RELEASE_NAME}-${id}`;
  }

  private updateConsensusNodesInRemoteConfig(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Update consensus nodes in remote config',
      task: async ({config: {newBlockNodeComponent, priorityMapping}}): Promise<void> => {
        const state: DeploymentStateSchema = this.remoteConfig.configuration.state;
        const nodeAliases: string[] = Object.keys(priorityMapping);

        for (const node of state.consensusNodes.filter((node): boolean =>
          nodeAliases.includes(Templates.renderNodeAliasFromNumber(node.metadata.id)),
        )) {
          const priority: number = priorityMapping[Templates.renderNodeAliasFromNumber(node.metadata.id)];

          node.blockNodeMap.push([newBlockNodeComponent.metadata.id, priority]);
        }

        await this.remoteConfig.persist();
      },
    };
  }

  private updateConsensusNodesPostGenesis(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Copy block-nodes.json to consensus nodes',
      task: async ({config: {priorityMapping}}): Promise<void> => {
        const nodeAliases: string[] = Object.keys(priorityMapping);

        const filteredConsensusNodes: ConsensusNode[] = this.remoteConfig
          .getConsensusNodes()
          .filter((node): boolean => nodeAliases.includes(node.name));

        for (const node of filteredConsensusNodes) {
          await createAndCopyBlockNodeJsonFileForConsensusNode(
            node,
            this.logger,
            this.k8Factory,
            false,
            this.remoteConfig.configuration.versions.consensusNode,
          );
        }
      },
    };
  }

  private updateConsensusNodesPostGenesisForExternal(): SoloListrTask<BlockNodeAddExternalContext> {
    return {
      title: 'Copy block-nodes.json to consensus nodes',
      task: async ({config: {priorityMapping}}): Promise<void> => {
        const nodeAliases: string[] = Object.keys(priorityMapping);

        const filteredConsensusNodes: ConsensusNode[] = this.remoteConfig
          .getConsensusNodes()
          .filter((node): boolean => nodeAliases.includes(node.name));

        for (const node of filteredConsensusNodes) {
          await createAndCopyBlockNodeJsonFileForConsensusNode(
            node,
            this.logger,
            this.k8Factory,
            false,
            this.remoteConfig.configuration.versions.consensusNode,
          );
        }
      },
    };
  }

  private handleConsensusNodeUpdating(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Update consensus nodes',
      task: (_, task): SoloListr<BlockNodeDeployContext> => {
        const subTasks: SoloListrTask<BlockNodeDeployContext>[] = [this.updateConsensusNodesInRemoteConfig()];

        if (this.remoteConfig.configuration.state.ledgerPhase !== LedgerPhase.UNINITIALIZED) {
          subTasks.push(this.updateConsensusNodesPostGenesis());
        }

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.DEFAULT);
      },
    };
  }

  private updateConsensusNodesInRemoteConfigForExternalBlockNode(): SoloListrTask<BlockNodeAddExternalContext> {
    return {
      title: 'Update consensus nodes in remote config',
      task: async ({config: {newExternalBlockNodeComponent, priorityMapping}}): Promise<void> => {
        const state: DeploymentStateSchema = this.remoteConfig.configuration.state;
        const nodeAliases: string[] = Object.keys(priorityMapping);

        for (const node of state.consensusNodes.filter((node): boolean =>
          nodeAliases.includes(Templates.renderNodeAliasFromNumber(node.metadata.id)),
        )) {
          const priority: number = priorityMapping[Templates.renderNodeAliasFromNumber(node.metadata.id)];

          node.externalBlockNodeMap.push([newExternalBlockNodeComponent.id, priority]);
        }

        this.remoteConfig.configuration.state.consensusNodes = state.consensusNodes;

        await this.remoteConfig.persist();
      },
    };
  }

  private handleConsensusNodeUpdatingForExternalBlockNode(): SoloListrTask<BlockNodeAddExternalContext> {
    return {
      title: 'Update consensus nodes',
      task: (_, task): SoloListr<BlockNodeAddExternalContext> => {
        const subTasks: SoloListrTask<BlockNodeAddExternalContext>[] = [
          this.updateConsensusNodesInRemoteConfigForExternalBlockNode(),
        ];

        if (this.remoteConfig.configuration.state.ledgerPhase !== LedgerPhase.UNINITIALIZED) {
          subTasks.push(this.updateConsensusNodesPostGenesisForExternal());
        }

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.DEFAULT);
      },
    };
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<BlockNodeDeployContext> = this.taskList.newTaskList<BlockNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.loadRemoteConfigOrWarn(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

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

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            config.priorityMapping = Templates.parseBlockNodePriorityMapping(
              config.priorityMapping as unknown as string,
              this.remoteConfig.getConsensusNodes(),
            );

            config.chartVersion = SemanticVersion.getValidSemanticVersion(
              config.chartVersion,
              false,
              'Block node chart version',
            );

            // --image-tag is kept for backwards compatibility; normalize it to componentImage
            // so downstream chart-values and kind-load logic has a single code path.
            if (!config.componentImage && config.imageTag) {
              config.componentImage = `${constants.BLOCK_NODE_IMAGE_NAME}:${config.imageTag}`;
            }

            config.livenessCheckPort = this.getLivenessCheckPortNumber(config);

            await this.persistBlockNodeMessageSizeOverrides(
              config.blockNodeMessageSizeSoftLimitBytes,
              config.blockNodeMessageSizeHardLimitBytes,
            );

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
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

            config.newBlockNodeComponent.metadata.phase = DeploymentPhase.REQUESTED;
          },
        },
        this.addBlockNodeComponent(),
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            config.chartValues = await this.prepareValuesArgForBlockNode(config);
          },
        },
        this.loadImageIntoKindTask(),
        {
          title: 'Deploy block node',
          task: async ({config}, task): Promise<void> => {
            const {
              context,
              namespace,
              releaseName,
              chartVersion,
              chartValues,
              componentImage,
              blockNodeChartDirectory,
              newBlockNodeComponent,
            } = config;

            await this.chartManager.install(
              namespace,
              releaseName,
              constants.BLOCK_NODE_CHART,
              blockNodeChartDirectory || constants.BLOCK_NODE_CHART_URL,
              chartVersion,
              chartValues,
              context,
              false,
              false,
              Boolean(blockNodeChartDirectory),
            );

            this.remoteConfig.configuration.components.changeComponentPhase(
              newBlockNodeComponent.metadata.id,
              ComponentTypes.BlockNode,
              DeploymentPhase.DEPLOYED,
            );

            await this.remoteConfig.persist();

            if (componentImage && this.isLocalImageAvailableInDocker(componentImage)) {
              // update config map with new VERSION info since
              // it will be used as a critical environment variable by block node
              const localImageTag: string = this.splitImageNameTag(componentImage).tag;
              const blockNodeId: ComponentId = newBlockNodeComponent.metadata.id;

              const name: string = `block-node-${blockNodeId}-config`;
              const data: Record<string, string> = {VERSION: localImageTag};

              await this.k8Factory.getK8(context).configMaps().update(namespace, name, data);
              task.title += ` with local built image (${localImageTag})`;
            }

            showVersionBanner(this.logger, releaseName, chartVersion);

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
          task: async ({config: {newBlockNodeComponent, context, namespace}}): Promise<void> => {
            const labels: string[] = Templates.renderBlockNodeLabels(newBlockNodeComponent.metadata.id);

            const blockNodePods: Pod[] = await this.k8Factory.getK8(context).pods().list(namespace, labels);

            if (blockNodePods.length === 0) {
              throw new SoloErrors.system.blockNodePodNotFound();
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
              throw new SoloErrors.system.blockNodeNotReady(config.releaseName, error);
            }
          },
        },
        this.checkBlockNodeReadiness(),
        this.handleConsensusNodeUpdating(),
        this.emitBlockNodeDeployed(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'block node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.blockNodeDeployFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<BlockNodeDestroyContext> = this.taskList.newTaskList<BlockNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

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

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
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
        this.removeBlockNodeComponentFromRemoteConfig(),
        this.rebuildBlockNodesJsonForConsensusNodes(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'block node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.blockNodeDestroyFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  private downloadBlockNodeJavaFlightRecorderLogs(): SoloListrTask<BlockNodeCollectJfrContext> {
    return {
      title: 'Download Java Flight Recorder logs from block node pod',
      task: async ({config}, task): Promise<void> => {
        const labels: string[] = Templates.renderBlockNodeLabels(config.id);
        const blockNodePods: Pod[] = await this.k8Factory.getK8(config.context).pods().list(config.namespace, labels);

        if (blockNodePods.length === 0) {
          throw new SoloErrors.system.blockNodePodNotFound();
        }

        const podReference: PodReference = blockNodePods[0].podReference;
        const containerReference: ContainerReference = ContainerReference.of(
          podReference,
          constants.BLOCK_NODE_CONTAINER_NAME,
        );
        const k8Container: Container = this.k8Factory.getK8(config.context).containers().readByRef(containerReference);

        const repositoryDirectory: string = constants.BLOCK_NODE_JFR_REPOSITORY_DIRECTORY;
        const collectedRecordingPath: string = `${repositoryDirectory}/collected-recording.jfr`;

        const consolidateScript: string =
          'set -e; ' +
          `finalized=$(ls -1 ${repositoryDirectory}/*/*.jfr 2>/dev/null | sort | sed '$d'); ` +
          `if [ -z "$finalized" ]; then echo "${BlockNodeCommand.NO_JFR_MARKER}"; exit 0; fi; ` +
          `cat $finalized > ${collectedRecordingPath}`;

        let consolidateResult: string;
        try {
          consolidateResult = await k8Container.execContainer(['bash', '-c', consolidateScript]);
        } catch (error) {
          throw new SoloErrors.component.blockNodeJfrCollectionFailed(error);
        }

        if (consolidateResult.includes(BlockNodeCommand.NO_JFR_MARKER)) {
          const reason: string = `no finalized Java Flight Recorder chunk found in ${repositoryDirectory} on block node pod ${podReference.name}; the block node may not have been deployed with Java Flight Recorder enabled, or the recording is still shorter than one chunk`;
          this.logger.warn(reason);
          task.skip(`${task.title} ${chalk.yellow('[SKIPPING]')} ${chalk.grey(reason)}`);
          return;
        }

        const localJfrLogsDirectory: string = PathEx.join(constants.SOLO_LOGS_DIR, config.deployment);
        fs.mkdirSync(localJfrLogsDirectory, {recursive: true});

        await k8Container.copyFrom(collectedRecordingPath, localJfrLogsDirectory);

        const downloadedRecordingPath: string = PathEx.join(localJfrLogsDirectory, 'collected-recording.jfr');
        this.logger.showUser(`Downloaded Java Flight Recorder recording to ${downloadedRecordingPath}`);
      },
    };
  }

  public async collectJfr(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<BlockNodeCollectJfrContext> = this.taskList.newTaskList<BlockNodeCollectJfrContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.COLLECT_JFR_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.COLLECT_JFR_FLAGS_LIST.required,
              ...BlockNodeCommand.COLLECT_JFR_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: BlockNodeCollectJfrConfigClass = this.configManager.getConfig(
              BlockNodeCommand.COLLECT_JFR_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeCollectJfrConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            config.id = this.inferBlockNodeId(config.id);

            await this.throwIfNamespaceIsMissing(config.context, config.namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.downloadBlockNodeJavaFlightRecorderLogs(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'block node collect-jfr',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.blockNodeJfrCollectionFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
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
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

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
            config.upgradeVersion ||= versions.BLOCK_NODE_VERSION;
            config.currentVersion =
              this.remoteConfig.getComponentVersion(ComponentTypes.BlockNode)?.toString() ?? '0.0.0';

            assertUpgradeVersionNotOlder(
              'Block node',
              config.upgradeVersion,
              this.remoteConfig.getComponentVersion(ComponentTypes.BlockNode),
              optionFromFlag(flags.upgradeVersion),
            );

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
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
              throw new SoloErrors.system.blockNodeNotInRemoteConfig(config.releaseName, error);
            }
          },
        },
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            config.chartValues = await this.prepareValuesArgForBlockNode(config);
          },
        },
        {
          title: 'Plan block node upgrade migration',
          task: async ({config}, task): Promise<void> => {
            config.migrationPlan = this.buildBlockNodeUpgradeMigrationPlan(
              config.currentVersion,
              config.upgradeVersion,
            );

            const renderedPlan: string = config.migrationPlan
              .map((step): string => `${step.fromVersion} -> ${step.toVersion} [${step.strategy}] (${step.reason})`)
              .join(' | ');
            task.title = `${task.title}: ${renderedPlan}`;
          },
        },
        {
          title: 'Update block node chart',
          task: async ({config}): Promise<void> => {
            const {namespace, releaseName, context} = config;

            for (const step of config.migrationPlan) {
              const stepTargetVersion: string = SemanticVersion.getValidSemanticVersion(
                step.toVersion,
                false,
                'Block node chart version',
              );
              const stepChartValues: HelmChartValues = BlockNodeCommand.appendExtraCommandArgs(
                config.chartValues,
                step.extraCommandArgs,
              );

              if (step.strategy === 'recreate') {
                this.logger.showUser(
                  `Applying block node recreate migration for ${releaseName} (${step.fromVersion} -> ${stepTargetVersion}): ${step.reason}`,
                );
                await this.recreateBlockNodeChart(config, stepTargetVersion, step);
              } else {
                try {
                  await this.chartManager.upgrade(
                    namespace,
                    releaseName,
                    constants.BLOCK_NODE_CHART,
                    config.blockNodeChartDirectory || constants.BLOCK_NODE_CHART_URL,
                    stepTargetVersion,
                    stepChartValues,
                    context,
                    false,
                    false,
                    false,
                    Boolean(config.blockNodeChartDirectory),
                  );
                } catch (error) {
                  if (this.isImmutableStatefulSetError(error)) {
                    this.logger.showUser(
                      `Detected immutable StatefulSet upgrade for ${releaseName}; retrying with recreate migration`,
                    );
                    await this.recreateBlockNodeChart(config, stepTargetVersion, step);
                  } else {
                    throw error;
                  }
                }
              }

              // Persist the applied step version so remote config reflects the last
              // successfully applied step even if a later step fails.
              this.remoteConfig.updateComponentVersion(
                ComponentTypes.BlockNode,
                new SemanticVersion<string>(stepTargetVersion),
              );
              await this.remoteConfig.persist();
            }

            showVersionBanner(this.logger, constants.BLOCK_NODE_CHART, config.upgradeVersion);

            await this.updateBlockNodeVersionInRemoteConfig(config);
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
                  Templates.renderBlockNodeLabels(config.id),
                  constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.BLOCK_NODE_PODS_RUNNING_DELAY,
                  config.recreateInstallTime,
                );
            } catch (error) {
              throw new SoloErrors.system.blockNodeNotReady(config.releaseName, error);
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'block node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.blockNodeUpgradeFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async addExternal(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<BlockNodeAddExternalContext> = this.taskList.newTaskList<BlockNodeAddExternalContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.ADD_EXTERNAL_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.ADD_EXTERNAL_FLAGS_LIST.required,
              ...BlockNodeCommand.ADD_EXTERNAL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: BlockNodeAddExternalConfigClass = this.configManager.getConfig(
              BlockNodeCommand.ADD_EXTERNAL_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeAddExternalConfigClass;

            context_.config = config;

            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            config.namespace = await this.getNamespace(task);

            config.priorityMapping = Templates.parseBlockNodePriorityMapping(
              config.priorityMapping as unknown as string,
              this.remoteConfig.getConsensusNodes(),
            );

            const id: ComponentId = this.remoteConfig.configuration.state.externalBlockNodes.length + 1;

            const [address, port] = Templates.parseExternalBlockAddress(config.externalBlockNodeAddress);
            config.newExternalBlockNodeComponent = new ExternalBlockNodeStateSchema(id, address, port);

            this.logger.showUser(
              'Configuring external block node, ' +
                `${chalk.grey('ID')} ${chalk.cyan(`[${id}]`)}, ` +
                `${chalk.grey('address')} ${chalk.cyan(`[${address}:${port}]`)} `,
            );

            await this.persistBlockNodeMessageSizeOverrides(
              config.blockNodeMessageSizeSoftLimitBytes,
              config.blockNodeMessageSizeHardLimitBytes,
            );

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.addExternalBlockNodeComponent(),
        this.handleConsensusNodeUpdatingForExternalBlockNode(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'block node add-external',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.blockNodeAddExternalFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async deleteExternal(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<BlockNodeDeleteExternalContext> = this.taskList.newTaskList<BlockNodeDeleteExternalContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.DELETE_EXTERNAL_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.DELETE_EXTERNAL_FLAGS_LIST.required,
              ...BlockNodeCommand.DELETE_EXTERNAL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: BlockNodeDeleteExternalConfigClass = this.configManager.getConfig(
              BlockNodeCommand.DELETE_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDeleteExternalConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            config.id = this.inferExternalBlockNodeId(config.id);

            await this.throwIfNamespaceIsMissing(config.context, config.namespace);

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.removeExternalBlockNodeComponent(),
        this.rebuildBlockNodesJsonForConsensusNodes(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'block node delete-external',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.blockNodeDeleteExternalFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  private emitBlockNodeDeployed(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Signal block node deployed',
      task: ({config: {deployment}}): void => {
        this.eventBus.emit(new BlockNodeDeployedEvent(deployment));
      },
    };
  }

  private rebuildBlockNodesJsonForConsensusNodes(): SoloListrTask<AnyListrContext> {
    return {
      title: "Rebuild 'block.nodes.json' for consensus nodes",
      skip: (): boolean => this.remoteConfig.configuration.state.ledgerPhase === LedgerPhase.UNINITIALIZED,
      task: async (): Promise<void> => {
        for (const node of this.remoteConfig.getConsensusNodes()) {
          await createAndCopyBlockNodeJsonFileForConsensusNode(
            node,
            this.logger,
            this.k8Factory,
            true,
            this.remoteConfig.configuration.versions.consensusNode,
          );
        }
      },
    };
  }

  /// Returns the port used for the block node liveness/readiness check.
  ///
  /// Block node >= v0.39.0 serves its health endpoints (`/healthz/readyz`) from a dedicated
  /// web server on `BLOCK_NODE_HEALTH_PORT`; earlier versions served them from the gRPC port
  /// (`BLOCK_NODE_PORT`). The effective version is the higher of the chart version and a local
  /// image tag (when set), mirroring `updateBlockNodeVersionInRemoteConfig`.
  private getLivenessCheckPortNumber(config: BlockNodeDeployConfigClass): number {
    let blockNodeVersion: SemanticVersion<string> = new SemanticVersion<string>(config.chartVersion);

    if (config.componentImage && this.isLocalImageReference(config.componentImage)) {
      const tag: string = this.splitImageNameTag(config.componentImage).tag;
      const imageVersion: SemanticVersion<string> = new SemanticVersion<string>(tag);
      if (blockNodeVersion.lessThan(imageVersion)) {
        blockNodeVersion = imageVersion;
      }
    }

    const minimumVersion: SemanticVersion<string> = new SemanticVersion<string>(
      versions.MINIMUM_HIERO_BLOCK_NODE_VERSION_FOR_DEDICATED_HEALTH_PORT,
    );
    return blockNodeVersion.greaterThanOrEqual(minimumVersion)
      ? constants.BLOCK_NODE_HEALTH_PORT
      : constants.BLOCK_NODE_PORT;
  }

  private async updateBlockNodeVersionInRemoteConfig(
    config: BlockNodeDeployConfigClass | BlockNodeUpgradeConfigClass,
  ): Promise<void> {
    let blockNodeVersion: SemanticVersion<string>;
    let componentImageVersion: SemanticVersion<string> | undefined;

    if (config.hasOwnProperty('upgradeVersion') && (config as BlockNodeUpgradeConfigClass).upgradeVersion) {
      const version: string = (config as BlockNodeUpgradeConfigClass).upgradeVersion;
      blockNodeVersion = typeof version === 'string' ? new SemanticVersion<string>(version) : version;
    }

    if (config.hasOwnProperty('chartVersion') && (config as BlockNodeDeployConfigClass).chartVersion) {
      const version: string = (config as BlockNodeDeployConfigClass).chartVersion;
      blockNodeVersion = typeof version === 'string' ? new SemanticVersion<string>(version) : version;
    }

    const deployConfig: BlockNodeDeployConfigClass = config as BlockNodeDeployConfigClass;
    if (deployConfig.componentImage && this.isLocalImageReference(deployConfig.componentImage)) {
      const tag: string = this.splitImageNameTag(deployConfig.componentImage).tag;
      componentImageVersion = new SemanticVersion<string>(tag);
    }

    const finalVersion: SemanticVersion<string> =
      componentImageVersion && blockNodeVersion.lessThan(componentImageVersion)
        ? componentImageVersion
        : blockNodeVersion;
    this.remoteConfig.updateComponentVersion(ComponentTypes.BlockNode, finalVersion);

    await this.remoteConfig.persist();
  }

  private buildBlockNodeUpgradeMigrationPlan(
    currentVersion: string,
    targetVersion: string,
  ): ComponentUpgradeMigrationStep[] {
    const normalizedCurrentVersion: string = SemanticVersion.getValidSemanticVersion(
      currentVersion || '0.0.0',
      false,
      'Current block node chart version',
    );
    const normalizedTargetVersion: string = SemanticVersion.getValidSemanticVersion(
      targetVersion || versions.BLOCK_NODE_VERSION,
      false,
      'Target block node chart version',
    );

    return ComponentUpgradeMigrationRules.planUpgradeMigrationPath(
      BlockNodeCommand.MIGRATION_COMPONENT_KEY,
      normalizedCurrentVersion,
      normalizedTargetVersion,
    );
  }

  private isImmutableStatefulSetError(error: unknown): boolean {
    const message: string = error instanceof Error ? error.message : String(error);
    return message.includes('StatefulSet.apps') && message.includes('spec: Forbidden');
  }

  private async recreateBlockNodeChart(
    config: BlockNodeUpgradeConfigClass,
    validatedUpgradeVersion: string,
    step: ComponentUpgradeMigrationStep,
  ): Promise<void> {
    const chartValues: HelmChartValues = BlockNodeCommand.appendExtraCommandArgs(
      config.chartValues,
      step.extraCommandArgs,
    );
    await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);

    // Wait for the old pod to be fully terminated before creating the new StatefulSet.
    // helm uninstall returns immediately (no --wait), but the pod has a graceful shutdown period.
    // The new StatefulSet will not create a replacement pod until the old pod with the same
    // ordinal name is completely gone (StatefulSet at-most-one semantics), and the PVC cannot
    // be reattached while the old pod still holds a ReadWriteOnce volume mount.
    await this.waitForBlockNodePodsDeleted(config.namespace, config.id, config.context);

    // Record the install time so the readiness check can ignore any stale pod references.
    config.recreateInstallTime = new Date();

    await this.chartManager.install(
      config.namespace,
      config.releaseName,
      constants.BLOCK_NODE_CHART,
      config.blockNodeChartDirectory || constants.BLOCK_NODE_CHART_URL,
      validatedUpgradeVersion,
      chartValues,
      config.context,
      false,
      false,
      Boolean(config.blockNodeChartDirectory),
    );
  }

  /**
   * Polls until no pods with the block-node label exist in the namespace.
   * Used before re-installing the chart so the new StatefulSet pod is not blocked
   * by a terminating predecessor.
   */
  private async waitForBlockNodePodsDeleted(namespace: NamespaceName, id: ComponentId, context: string): Promise<void> {
    const labels: string[] = Templates.renderBlockNodeLabels(id);
    const maxAttempts: number = constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS;
    const delay: number = constants.BLOCK_NODE_PODS_RUNNING_DELAY;

    for (let attempt: number = 0; attempt < maxAttempts; attempt++) {
      const pods: Pod[] = await this.k8Factory.getK8(context).pods().list(namespace, labels);
      if (pods.length === 0) {
        return;
      }
      await new Promise<void>((resolve): ReturnType<typeof setTimeout> => setTimeout(resolve, delay));
    }

    this.logger.warn(
      `Block node pods with labels ${labels.join(',')} did not terminate within ${maxAttempts} attempts; proceeding with install`,
    );
  }

  /** Adds the block node component to remote config. */
  private addBlockNodeComponent(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded() || this.oneShotState.isActive(),
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
  private addExternalBlockNodeComponent(): SoloListrTask<BlockNodeAddExternalContext> {
    return {
      title: 'Add external block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config: {newExternalBlockNodeComponent}}): Promise<void> => {
        this.remoteConfig.configuration.state.externalBlockNodes.push(newExternalBlockNodeComponent);

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the block node component to remote config. */
  private removeBlockNodeComponentFromRemoteConfig(): SoloListrTask<BlockNodeDestroyContext> {
    return {
      title: 'Disable block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.BlockNode);

        for (const node of this.remoteConfig.configuration.state.consensusNodes) {
          node.blockNodeMap = node.blockNodeMap.filter(([id]): boolean => id !== config.id);
        }

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the block node component to remote config. */
  private removeExternalBlockNodeComponent(): SoloListrTask<BlockNodeDestroyContext> {
    return {
      title: 'Remove block node component from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.state.externalBlockNodes =
          this.remoteConfig.configuration.state.externalBlockNodes.filter(
            (component): boolean => component.id !== config.id,
          );

        for (const node of this.remoteConfig.configuration.state.consensusNodes) {
          node.externalBlockNodeMap = node.externalBlockNodeMap.filter(([id]): boolean => id !== config.id);
        }

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
            const response: string = await withTimeout(
              this.k8Factory
                .getK8(config.context)
                .containers()
                .readByRef(containerReference)
                .execContainer(['bash', '-c', `curl -s http://localhost:${config.livenessCheckPort}/healthz/readyz`]),
              Duration.ofSeconds(constants.BLOCK_NODE_ACTIVE_TIMEOUT),
              'Healthcheck timed out',
            );

            if (response !== 'OK') {
              throw new SoloErrors.component.blockNodeHealthCheckFailed('bad response status');
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
          throw new SoloErrors.component.blockNodeHealthCheckFailed('max attempts reached');
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
      throw new SoloErrors.system.blockNodeNotInRemoteConfig(id);
    }

    return this.remoteConfig.configuration.components.state.blockNodes[0].metadata.id;
  }

  private inferExternalBlockNodeId(id: Optional<ComponentId>): ComponentId {
    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.externalBlockNodes.length === 0) {
      throw new SoloErrors.system.externalBlockNodeNotInRemoteConfig(id);
    }

    return this.remoteConfig.configuration.components.state.externalBlockNodes[0].id;
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

  private async inferDestroyData(id: ComponentId, namespace: NamespaceName, context: Context): Promise<InferredData> {
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

export default BlockNodeCommand;
