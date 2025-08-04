// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import * as helpers from '../core/helpers.js';
import {showVersionBanner} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {
  type AnyListrContext,
  type AnyYargs,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as Base64 from 'js-base64';
import {
  type ClusterReferenceName,
  type CommandDefinition,
  type Context,
  type DeploymentName,
  type Optional,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {HEDERA_JSON_RPC_RELAY_VERSION} from '../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Templates} from '../core/templates.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {CommandFlag, CommandFlags} from '../types/flag-types.js';
import {Lock} from '../core/lock/lock.js';
import {NodeServiceMapping} from '../types/mappings/node-service-mapping.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {type RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {Duration} from '../core/time/duration.js';
import {Version} from '../business/utils/version.js';

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
  forcePortForward: Optional<boolean>;
  cacheDir: Optional<string>;
}

interface RelayDeployContext {
  config: RelayDeployConfigClass;
}

@injectable()
export class RelayCommand extends BaseCommand {
  public static readonly DEPLOY_COMMAND = 'relay deploy';

  public constructor(
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
  ) {
    super();

    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  public static readonly COMMAND_NAME: string = 'relay';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.chainId,
      flags.chartDirectory,
      flags.clusterRef,
      flags.deployment,
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
    ],
  };

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.chartDirectory,
      flags.deployment,
      flags.nodeAliasesUnparsed,
      flags.clusterRef,
      flags.quiet,
      flags.id,
    ],
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
  }: RelayDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag(flags.profileName);
    const profileValuesFile: string = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    // TODO need to change this so that the json rpc relay does not have to be in the same cluster as the mirror node
    valuesArgument += ' --install';
    valuesArgument += helpers.populateHelmArguments({nameOverride: releaseName});

    valuesArgument += ' --set ws.enabled=true';
    valuesArgument += ` --set relay.config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArgument += ` --set relay.config.MIRROR_NODE_URL_WEB3=http://${constants.MIRROR_NODE_RELEASE_NAME}-web3`;
    valuesArgument += ' --set relay.config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArgument += ' --set relay.config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArgument += ' --set relay.config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    valuesArgument += ` --set ws.config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
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
        const namespace: NamespaceName = NamespaceName.of(
          this.localConfig.configuration.deploymentByName(deployment).namespace,
        );

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

  private getReleaseName(id?: number): string {
    if (!id) {
      id = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.RelayNodes);
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

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<RelayDeployContext> = this.taskList.newTaskList<RelayDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();
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
              [],
            ) as RelayDeployConfigClass;

            context_.config = config;

            config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
            config.nodeAliases = helpers.parseNodeAliases(
              config.nodeAliasesUnparsed,
              this.remoteConfig.getConsensusNodes(),
              this.configManager,
            );

            if (!config.clusterRef) {
              config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            const context: Context = this.remoteConfig.getClusterRefs()[config.clusterRef];
            if (context) {
              config.context = context;
            }

            config.releaseName = this.getReleaseName();

            const nodeIds: NodeId[] = config.nodeAliases.map((nodeAlias: NodeAlias): number =>
              Templates.nodeIdFromNodeAlias(nodeAlias),
            );

            config.newRelayComponent = this.componentFactory.createNewRelayComponent(
              config.clusterRef,
              config.namespace,
              nodeIds,
            );

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async ({config}): Promise<void> => {
            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async ({config}): Promise<void> => {
            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              config.forcePortForward,
            );

            config.valuesArg = await this.prepareValuesArgForRelay(config);
          },
        },
        {
          title: 'Deploy JSON RPC Relay',
          task: async ({config}): Promise<void> => {
            await this.chartManager.upgrade(
              config.namespace,
              config.releaseName,
              constants.JSON_RPC_RELAY_CHART,
              constants.JSON_RPC_RELAY_CHART,
              '',
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, HEDERA_JSON_RPC_RELAY_VERSION);
            await helpers.sleep(Duration.ofSeconds(40)); // wait for the pod to destroy in case it was an upgrade
          },
        },
        {
          title: 'Check relay is running',
          task: async ({config}): Promise<void> => {
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  Templates.renderRelayLabels(config.newRelayComponent.metadata.id),
                  constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.RELAY_PODS_RUNNING_DELAY,
                );
            } catch (error) {
              throw new SoloError(`Relay ${config.releaseName} is not running: ${error.message}`, error);
            }
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
        },
        {
          title: 'Check relay is ready',
          task: async ({config}): Promise<void> => {
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  Templates.renderRelayLabels(config.newRelayComponent.metadata.id),
                  constants.RELAY_PODS_READY_MAX_ATTEMPTS,
                  constants.RELAY_PODS_READY_DELAY,
                );
            } catch (error) {
              throw new SoloError(`Relay ${config.releaseName} is not ready: ${error.message}`, error);
            }
          },
        },
        this.addRelayComponent(),
        {
          title: 'Enable port forwarding',
          task: async ({config}): Promise<void> => {
            const pods: Pod[] = await this.k8Factory
              .getK8(config.context)
              .pods()
              .list(config.namespace, Templates.renderRelayLabels(config.newRelayComponent.metadata.id));

            if (pods.length === 0) {
              throw new SoloError('No Relay pod found');
            }

            const podReference: PodReference = pods[0].podReference;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .readByReference(podReference)
              .portForward(constants.JSON_RPC_RELAY_PORT, constants.JSON_RPC_RELAY_PORT, true);

            this.logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding enabled');
            this.logger.addMessageGroupMessage(
              constants.PORT_FORWARDING_MESSAGE_GROUP,
              `JSON RPC Relay forward enabled on localhost:${constants.JSON_RPC_RELAY_PORT}`,
            );
          },
          skip: ({config}): boolean => !config.forcePortForward,
        },
        // TODO only show this if we are not running in quick-start mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      RelayCommand.DEPLOY_COMMAND,
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error deploying relay: ${error.message}`, error);
      } finally {
        if (lease) {
          await lease.release();
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease.release();
        await this.accountManager.close();
      });
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: Listr<RelayDestroyContext> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef, flags.id, flags.nodeAliasesUnparsed]);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DESTROY_FLAGS_LIST.required,
              ...RelayCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const clusterReference: ClusterReferenceName =
              this.configManager.getFlag(flags.clusterRef) ?? this.k8Factory.default().clusters().readCurrent();

            let context: Context = this.configManager.getFlag(flags.context);

            if (clusterReference && !context) {
              context = this.remoteConfig.getClusterRefs()[clusterReference];
            }

            let id: number = this.configManager.getFlag(flags.id);
            let nodeAliases: NodeAliases = helpers.parseNodeAliases(
              this.configManager.getFlag(flags.nodeAliasesUnparsed),
              this.remoteConfig.getConsensusNodes(),
              this.configManager,
            );

            if (typeof id !== 'number') {
              if (this.remoteConfig.configuration.components.state.relayNodes.length === 0) {
                throw new SoloError('Relay node not found');
              }

              id = this.remoteConfig.configuration.components.state.relayNodes[0].metadata.id;
            }

            const namespace: NamespaceName = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );
            let isLegacyChartInstalled: boolean = false;
            let isChartInstalled: boolean;

            if (id === 1) {
              nodeAliases = this.remoteConfig.configuration.components
                .getComponentById<RelayNodeStateSchema>(ComponentTypes.RelayNodes, id)
                ?.consensusNodeIds.map((nodeId: NodeId): NodeAlias => Templates.renderNodeAliasFromNumber(nodeId + 1));

              isLegacyChartInstalled = await this.chartManager.isChartInstalled(
                namespace,
                this.prepareLegacyReleaseName(nodeAliases),
                context,
              );
            }

            let releaseName: string;

            if (isLegacyChartInstalled) {
              isChartInstalled = true;
              releaseName = this.prepareLegacyReleaseName(nodeAliases);
            } else {
              releaseName = this.getReleaseName(id);
              isChartInstalled = await this.chartManager.isChartInstalled(namespace, releaseName, context);
            }

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

            return ListrLock.newAcquireLockTask(lease, task);
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
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError('Error uninstalling relays', error);
    } finally {
      if (lease) {
        await lease.release();
      }
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: RelayCommand.COMMAND_NAME,
      desc: 'Manage JSON RPC relays in solo network',
      builder: (yargs: AnyYargs): AnyYargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running 'relay deploy' ===");

              await self.deploy(argv).then((r: boolean): void => {
                self.logger.info('==== Finished running `relay deploy`====');
                if (!r) {
                  throw new SoloError('Error deploying relay, expected return value to be true');
                }
              });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy JSON RPC relay',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...RelayCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...RelayCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running 'relay destroy' ===");

              await self.destroy(argv).then((r: boolean): void => {
                self.logger.info('==== Finished running `relay destroy`====');

                if (!r) {
                  throw new SoloError('Error destroying relay, expected return value to be true');
                }
              });
            },
          })
          .demandCommand(1, 'Select a relay command');
      },
    };
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
}
