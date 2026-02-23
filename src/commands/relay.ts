// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import * as helpers from '../core/helpers.js';
import {showVersionBanner} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {
  type AnyListrContext,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as Base64 from 'js-base64';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  type DeploymentName,
  NamespaceNameAsString,
  type Optional,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Templates} from '../core/templates.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {Lock} from '../core/lock/lock.js';
import {NodeServiceMapping} from '../types/mappings/node-service-mapping.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {type RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {Duration} from '../core/time/duration.js';
import {Version} from '../business/utils/version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {SemVer} from 'semver';
import {MIRROR_INGRESS_CONTROLLER} from '../core/constants.js';

interface RelayDestroyConfigClass {
  chartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  releaseName: string;
  isChartInstalled: boolean;
  clusterRef: Optional<ClusterReferenceName>;
  context: Optional<string>;
  id: number;
  isLegacyChartInstalled: boolean;
}

interface RelayDestroyContext {
  config: RelayDestroyConfigClass;
}

interface RelayDeployConfigClass {
  chainId: string;
  chartDirectory: string;
  relayChartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  operatorId: string;
  operatorKey: string;
  profileFile: string;
  profileName: string;
  relayReleaseTag: string;
  replicaCount: number;
  valuesFile: string;
  isChartInstalled: boolean;
  nodeAliases: NodeAliases;
  releaseName: string;
  valuesArg: string;
  clusterRef: Optional<ClusterReferenceName>;
  domainName: Optional<string>;
  context: Optional<string>;
  newRelayComponent: RelayNodeStateSchema;
  id: ComponentId;
  forcePortForward: Optional<boolean>;
  cacheDir: Optional<string>;
  isLegacyChartInstalled: false;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface RelayDeployContext {
  config: RelayDeployConfigClass;
}

interface RelayUpgradeConfigClass {
  chainId: string;
  chartDirectory: string;
  relayChartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  operatorId: string;
  operatorKey: string;
  profileFile: string;
  profileName: string;
  relayReleaseTag: string;
  replicaCount: number;
  valuesFile: string;
  isChartInstalled: boolean;
  nodeAliases: NodeAliases;
  releaseName: string;
  valuesArg: string;
  clusterRef: Optional<ClusterReferenceName>;
  domainName: Optional<string>;
  context: Optional<string>;
  id: ComponentId;
  forcePortForward: Optional<boolean>;
  cacheDir: Optional<string>;
  isLegacyChartInstalled: boolean;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface RelayUpgradeContext {
  config: RelayUpgradeConfigClass;
}

@injectable()
export class RelayCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
  ) {
    super();

    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'deployConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.chainId,
      flags.chartDirectory,
      flags.relayChartDirectory,
      flags.clusterRef,
      flags.nodeAliasesUnparsed,
      flags.operatorId,
      flags.operatorKey,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.relayReleaseTag,
      flags.replicaCount,
      flags.valuesFile,
      flags.domainName,
      flags.forcePortForward,
      flags.cacheDir,
      flags.devMode,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.chainId,
      flags.chartDirectory,
      flags.relayChartDirectory,
      flags.clusterRef,
      flags.nodeAliasesUnparsed,
      flags.operatorId,
      flags.operatorKey,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.relayReleaseTag,
      flags.replicaCount,
      flags.valuesFile,
      flags.domainName,
      flags.forcePortForward,
      flags.cacheDir,
      flags.id,
      flags.devMode,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.nodeAliasesUnparsed, flags.quiet, flags.devMode, flags.id],
  };

  private async prepareValuesArgForRelay({
    valuesFile,
    nodeAliases,
    chainId,
    relayReleaseTag,
    replicaCount,
    operatorId,
    operatorKey,
    namespace,
    domainName,
    context,
    releaseName,
    deployment,
    mirrorNamespace,
  }: RelayDeployConfigClass | RelayUpgradeConfigClass): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag(flags.profileName);
    const profileValuesFile: string = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    valuesArgument += ' --install';
    valuesArgument += helpers.populateHelmArguments({nameOverride: releaseName});

    valuesArgument += ' --set ws.enabled=true';
    valuesArgument += ` --set relay.config.MIRROR_NODE_URL=http://${MIRROR_INGRESS_CONTROLLER}-${mirrorNamespace}.${mirrorNamespace}.svc.cluster.local`;
    valuesArgument += ` --set relay.config.MIRROR_NODE_URL_WEB3=http://${MIRROR_INGRESS_CONTROLLER}-${mirrorNamespace}.${mirrorNamespace}.svc.cluster.local`;
    valuesArgument += ' --set relay.config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArgument += ' --set relay.config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArgument += ' --set relay.config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    valuesArgument += ` --set ws.config.MIRROR_NODE_URL=http://${MIRROR_INGRESS_CONTROLLER}-${mirrorNamespace}.${mirrorNamespace}.svc.cluster.local`;
    valuesArgument += ' --set ws.config.SUBSCRIPTIONS_ENABLED=true';

    if (chainId) {
      valuesArgument += ` --set relay.config.CHAIN_ID=${chainId}`;
      valuesArgument += ` --set ws.config.CHAIN_ID=${chainId}`;
    }

    if (relayReleaseTag) {
      relayReleaseTag = Version.getValidSemanticVersion(relayReleaseTag, false, 'Relay release');
      valuesArgument += ` --set relay.image.tag=${relayReleaseTag}`;
      valuesArgument += ` --set ws.image.tag=${relayReleaseTag}`;
    }

    if (replicaCount) {
      valuesArgument += ` --set relay.replicaCount=${replicaCount}`;
      valuesArgument += ` --set ws.replicaCount=${replicaCount}`;
    }

    const operatorIdUsing: string = operatorId || this.accountManager.getOperatorAccountId(deployment).toString();
    valuesArgument += ` --set relay.config.OPERATOR_ID_MAIN=${operatorIdUsing}`;
    valuesArgument += ` --set ws.config.OPERATOR_ID_MAIN=${operatorIdUsing}`;

    if (operatorKey) {
      // use user provided operatorKey if available
      valuesArgument += ` --set relay.config.OPERATOR_KEY_MAIN=${operatorKey}`;
      valuesArgument += ` --set ws.config.OPERATOR_KEY_MAIN=${operatorKey}`;
    } else {
      try {
        const secrets: Secret[] = await this.k8Factory
          .getK8(context)
          .secrets()
          .list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);
        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);
          valuesArgument += ` --set relay.config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
          valuesArgument += ` --set ws.config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
        } else {
          this.logger.info('Using operator key from k8s secret');
          const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
          valuesArgument += ` --set relay.config.OPERATOR_KEY_MAIN=${operatorKeyFromK8}`;
          valuesArgument += ` --set ws.config.OPERATOR_KEY_MAIN=${operatorKeyFromK8}`;
        }
      } catch (error) {
        throw new SoloError(`Error getting operator key: ${error.message}`, error);
      }
    }

    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkJsonString: string = await this.prepareNetworkJsonString(nodeAliases, namespace, deployment);
    valuesArgument += ` --set-literal relay.config.HEDERA_NETWORK='${networkJsonString}'`;
    valuesArgument += ` --set-literal ws.config.HEDERA_NETWORK='${networkJsonString}'`;

    if (domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'relay.ingress.enabled': true,
        'relay.ingress.hosts[0].host': domainName,
        'relay.ingress.hosts[0].paths[0].path': '/',
        'relay.ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    if (valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(valuesFile);
    }

    return valuesArgument;
  }

  /**
   * created a JSON string to represent the map between the node keys and their ids
   * output example '{"node-1": "0.0.3", "node-2": "0.004"}'
   */
  private async prepareNetworkJsonString(
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
  ): Promise<string> {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkIds: Record<string, string> = {};

    const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(nodeAliases, deployment);
    const networkNodeServicesMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deployment,
    );
    for (const nodeAlias of nodeAliases) {
      const haProxyClusterIp: string = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyGrpcPort: string | number = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      const networkKey: string = `${haProxyClusterIp}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    }

    return JSON.stringify(networkIds);
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.RelayNodes),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloError(`Invalid component id: ${id}, type: ${typeof id}`);
    }
    return `${constants.JSON_RPC_RELAY_RELEASE_NAME}-${id}`;
  }

  private prepareLegacyReleaseName(nodeAliases: NodeAliases = []): string {
    let releaseName: string = constants.JSON_RPC_RELAY_RELEASE_NAME;
    for (const nodeAlias of nodeAliases) {
      releaseName += `-${nodeAlias}`;
    }
    return releaseName;
  }

  private checkChartIsInstalledTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check chart is installed',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        config.isChartInstalled = await this.chartManager.isChartInstalled(
          config.namespace,
          config.releaseName,
          config.context,
        );
      },
    };
  }

  private prepareChartValuesTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prepare chart values',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        await this.accountManager.loadNodeClient(
          config.namespace,
          this.remoteConfig.getClusterRefs(),
          config.deployment,
          config.forcePortForward,
        );

        config.valuesArg = await this.prepareValuesArgForRelay(config);
      },
    };
  }

  private deployJsonRpcRelayTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Deploy JSON RPC Relay',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        await this.chartManager.upgrade(
          config.namespace,
          config.releaseName,
          constants.JSON_RPC_RELAY_CHART,
          config.relayChartDirectory || constants.JSON_RPC_RELAY_CHART,
          '', // relay.image.tag is used to set the version
          config.valuesArg,
          config.context,
        );

        showVersionBanner(this.logger, config.releaseName, config.relayReleaseTag);
        await helpers.sleep(Duration.ofSeconds(40)); // wait for the pod to destroy in case it was an upgrade
      },
    };
  }

  private checkRelayIsRunningTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check relay is running',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        try {
          await this.k8Factory
            .getK8(config.context)
            .pods()
            .waitForRunningPhase(
              config.namespace,
              Templates.renderRelayLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
              constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
              constants.RELAY_PODS_RUNNING_DELAY,
            );
        } catch (error) {
          throw new SoloError(`Relay ${config.releaseName} is not running: ${error.message}`, error);
        }
        // reset nodeAlias
        this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
      },
    };
  }

  private checkRelayIsReadyTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check relay is ready',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        try {
          await this.k8Factory
            .getK8(config.context)
            .pods()
            .waitForReadyStatus(
              config.namespace,
              Templates.renderRelayLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
              constants.RELAY_PODS_READY_MAX_ATTEMPTS,
              constants.RELAY_PODS_READY_DELAY,
            );
        } catch (error) {
          throw new SoloError(`Relay ${config.releaseName} is not ready: ${error.message}`, error);
        }
      },
    };
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for relay node',
      skip: ({config}: RelayDeployContext | RelayUpgradeContext): boolean => !config.forcePortForward,
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        const pods: Pod[] = await this.k8Factory
          .getK8(config.context)
          .pods()
          .list(
            config.namespace,
            Templates.renderRelayLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
          );

        if (pods.length === 0) {
          throw new SoloError('No Relay pod found');
        }

        const podReference: PodReference = pods[0].podReference;
        const clusterReference: string =
          (this.configManager.getFlag<string>(flags.clusterRef) as string) ??
          this.k8Factory.default().clusters().readCurrent();

        await this.remoteConfig.configuration.components.managePortForward(
          clusterReference,
          podReference,
          constants.JSON_RPC_RELAY_PORT, // Pod port
          constants.JSON_RPC_RELAY_PORT, // Local port
          this.k8Factory.getK8(config.context),
          this.logger,
          ComponentTypes.RelayNodes,
          'JSON RPC Relay',
          config.isChartInstalled, // Reuse existing port if chart is already installed
        );
        await this.remoteConfig.persist();
      },
    };
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<RelayDeployContext> = this.taskList.newTaskList<RelayDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            this.configManager.update(argv);

            flags.disablePrompts(RelayCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DEPLOY_FLAGS_LIST.required,
              ...RelayCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            const config: RelayDeployConfigClass = this.configManager.getConfig(
              RelayCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
              ['nodeAliases'],
            ) as RelayDeployConfigClass;

            context_.config = config;

            config.isLegacyChartInstalled = false;

            config.namespace = await this.getNamespace(task);

            config.nodeAliases = helpers.parseNodeAliases(
              config.nodeAliasesUnparsed,
              this.remoteConfig.getConsensusNodes(),
              this.configManager,
            );

            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            config.releaseName = this.getReleaseName();

            const nodeIds: NodeId[] = config.nodeAliases.map((nodeAlias: NodeAlias): number =>
              Templates.nodeIdFromNodeAlias(nodeAlias),
            );

            const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
              config.namespace,
              config.context,
            );

            config.mirrorNodeId = mirrorNodeId;
            config.mirrorNamespace = mirrorNamespace;
            config.mirrorNodeReleaseName = mirrorNodeReleaseName;

            config.newRelayComponent = this.componentFactory.createNewRelayComponent(
              config.clusterRef,
              config.namespace,
              nodeIds,
            );

            config.id = config.newRelayComponent.metadata.id;

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return null;
          },
        },
        this.checkChartIsInstalledTask(),
        this.prepareChartValuesTask(),
        this.deployJsonRpcRelayTask(),
        this.checkRelayIsRunningTask(),
        this.checkRelayIsReadyTask(),
        this.addRelayComponent(),
        this.enablePortForwardingTask(),
        // TODO only show this if we are not running in one-shot mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'relay node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error deploying relay: ${error.message}`, error);
      } finally {
        if (lease) {
          if (!this.oneShotState.isActive()) {
            await lease?.release();
          }
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      });
    }

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<RelayUpgradeContext> = this.taskList.newTaskList<RelayUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            this.configManager.update(argv);

            flags.disablePrompts(RelayCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.UPGRADE_FLAGS_LIST.required,
              ...RelayCommand.UPGRADE_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            const config: RelayUpgradeConfigClass = this.configManager.getConfig(
              RelayCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
              [],
            ) as RelayUpgradeConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);

            config.nodeAliases = helpers.parseNodeAliases(
              config.nodeAliasesUnparsed,
              this.remoteConfig.getConsensusNodes(),
              this.configManager,
            );

            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);

            const {id, isLegacyChartInstalled, isChartInstalled, releaseName, nodeAliases} = await this.inferRelayData(
              config.namespace,
              config.context,
            );

            config.id = id;
            config.isLegacyChartInstalled = isLegacyChartInstalled;
            config.isChartInstalled = isChartInstalled;
            config.releaseName = releaseName;
            config.nodeAliases = nodeAliases;

            const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
              config.namespace,
              config.context,
            );

            config.mirrorNodeId = mirrorNodeId;
            config.mirrorNamespace = mirrorNamespace;
            config.mirrorNodeReleaseName = mirrorNodeReleaseName;

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return null;
          },
        },
        this.prepareChartValuesTask(),
        this.deployJsonRpcRelayTask(),
        this.checkRelayIsRunningTask(),
        this.checkRelayIsReadyTask(),
        this.enablePortForwardingTask(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'relay node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error upgrading relay: ${error.message}`, error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<RelayDestroyContext> = this.taskList.newTaskList<RelayDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef, flags.id, flags.nodeAliasesUnparsed]);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DESTROY_FLAGS_LIST.required,
              ...RelayCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const context: Context = this.getClusterContext(clusterReference);
            const namespace: NamespaceName = await this.getNamespace(task);

            const {id, isLegacyChartInstalled, isChartInstalled, releaseName, nodeAliases} = await this.inferRelayData(
              namespace,
              context,
            );

            const config: RelayDestroyConfigClass = {
              chartDirectory: this.configManager.getFlag(flags.chartDirectory),
              namespace,
              nodeAliases,
              clusterRef: clusterReference,
              id,
              isLegacyChartInstalled,
              isChartInstalled,
              releaseName,
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
              context,
            };

            context_.config = config;

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return null;
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async ({config}): Promise<void> => {
            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);

            this.logger.showList(
              'Destroyed Relays',
              await this.chartManager.getInstalledCharts(config.namespace, config.context),
            );

            // reset nodeAliasesUnparsed
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        this.disableRelayComponent(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'relay node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError('Error uninstalling relays', error);
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

  /** Adds the relay component to remote config. */
  public addRelayComponent(): SoloListrTask<RelayDeployContext> {
    return {
      title: 'Add relay component in remote config',
      skip: ({config}): boolean => !this.remoteConfig.isLoaded() || config.isChartInstalled,
      task: async ({config}): Promise<void> => {
        const {namespace, nodeAliases, clusterRef} = config;

        const nodeIds: NodeId[] = nodeAliases.map((nodeAlias: NodeAlias): number =>
          Templates.nodeIdFromNodeAlias(nodeAlias),
        );

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewRelayComponent(clusterRef, namespace, nodeIds),
          ComponentTypes.RelayNodes,
        );

        // save relay version in remote config
        this.remoteConfig.updateComponentVersion(ComponentTypes.RelayNodes, new SemVer(config.relayReleaseTag));
        await this.remoteConfig.persist();
      },
    };
  }

  /** Remove the relay component from remote config. */
  public disableRelayComponent(): SoloListrTask<RelayDestroyContext> {
    return {
      title: 'Remove relay component from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.RelayNodes);

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
    nodeAliases: NodeAliases,
  ): Promise<boolean> {
    return id <= 1
      ? await this.chartManager.isChartInstalled(namespace, this.prepareLegacyReleaseName(nodeAliases), context)
      : false;
  }

  private inferRelayId(): ComponentId {
    const id: ComponentId = this.configManager.getFlag(flags.id);
    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.relayNodes.length === 0) {
      throw new SoloError('Relay node not found in remote config');
    }

    return this.remoteConfig.configuration.components.state.relayNodes[0].metadata.id;
  }

  private async inferRelayData(
    namespace: NamespaceName,
    context: Context,
  ): Promise<{
    id: ComponentId;
    nodeAliases: NodeAliases;
    releaseName: string;
    isChartInstalled: boolean;
    isLegacyChartInstalled: boolean;
  }> {
    const id: ComponentId = this.inferRelayId();

    const nodeAliases: NodeAliases = helpers.parseNodeAliases(
      this.configManager.getFlag(flags.nodeAliasesUnparsed),
      this.remoteConfig.getConsensusNodes(),
      this.configManager,
    );

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(
      id,
      namespace,
      context,
      nodeAliases,
    );

    if (isLegacyChartInstalled) {
      return {
        id,
        nodeAliases,
        releaseName: this.prepareLegacyReleaseName(nodeAliases),
        isChartInstalled: true,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      nodeAliases,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      isLegacyChartInstalled,
    };
  }
}
