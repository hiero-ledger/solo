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
  AnyListrContext,
  type AnyYargs,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as Base64 from 'js-base64';
import {
  type ClusterReference,
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
import {RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';

interface RelayDestroyConfigClass {
  chartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  releaseName: string;
  isChartInstalled: boolean;
  clusterRef: Optional<ClusterReference>;
  context: Optional<string>;
  id: number;
  useLegacyReleaseName: boolean;
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
  clusterRef: Optional<ClusterReference>;
  domainName: Optional<string>;
  context: Optional<string>;
  newRelayComponent: RelayNodeStateSchema;
}

interface RelayDeployContext {
  config: RelayDeployConfigClass;
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

  private async prepareValuesArgForRelay(
    valuesFile: string,
    nodeAliases: NodeAliases,
    chainID: string,
    relayRelease: string,
    replicaCount: number,
    operatorID: string,
    operatorKey: string,
    namespace: NamespaceName,
    domainName: Optional<string>,
    context: Optional<string>,
    releaseName: string,
  ): Promise<string> {
    let valuesArgument: string = '';

    const profileName: string = this.configManager.getFlag(flags.profileName);
    const profileValuesFile: string = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: releaseName});

    valuesArgument += ` --set config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArgument += ` --set config.MIRROR_NODE_URL_WEB3=http://${constants.MIRROR_NODE_RELEASE_NAME}-web3`;
    valuesArgument += ' --set config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArgument += ' --set config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArgument += ' --set config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    if (chainID) {
      valuesArgument += ` --set config.CHAIN_ID=${chainID}`;
    }

    if (relayRelease) {
      valuesArgument += ` --set image.tag=${relayRelease.replace(/^v/, '')}`;
    }

    if (replicaCount) {
      valuesArgument += ` --set replicaCount=${replicaCount}`;
    }

    const deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const operatorIdUsing: string = operatorID || this.accountManager.getOperatorAccountId(deploymentName).toString();
    valuesArgument += ` --set config.OPERATOR_ID_MAIN=${operatorIdUsing}`;

    if (operatorKey) {
      // use user provided operatorKey if available
      valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${operatorKey}`;
    } else {
      try {
        const namespace: NamespaceName = NamespaceName.of(
          this.localConfig.configuration.deploymentByName(deploymentName).namespace,
        );

        const secrets: Secret[] = await this.k8Factory
          .getK8(context)
          .secrets()
          .list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);
        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);
          valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
        } else {
          this.logger.info('Using operator key from k8s secret');
          const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
          valuesArgument += ` --set config.OPERATOR_KEY_MAIN=${operatorKeyFromK8}`;
        }
      } catch (error) {
        throw new SoloError(`Error getting operator key: ${error.message}`, error);
      }
    }

    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkJsonString: string = await this.prepareNetworkJsonString(nodeAliases, namespace);
    valuesArgument += ` --set config.HEDERA_NETWORK='${networkJsonString}'`;

    if (domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
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
  private async prepareNetworkJsonString(nodeAliases: NodeAliases = [], namespace: NamespaceName): Promise<string> {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkIds: Record<string, string> = {};

    const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(nodeAliases, deploymentName);
    const networkNodeServicesMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
    );
    for (const nodeAlias of nodeAliases) {
      const haProxyClusterIp: string = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyGrpcPort: string | number = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      const networkKey: string = `${haProxyClusterIp}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    }

    return JSON.stringify(networkIds);
  }

  private prepareReleaseName(id?: number): string {
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
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<RelayDeployContext> = new Listr<RelayDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            this.configManager.update(argv);

            flags.disablePrompts([
              flags.operatorId,
              flags.operatorKey,
              flags.clusterRef,
              flags.profileFile,
              flags.profileName,
            ]);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DEPLOY_FLAGS_LIST.required,
              ...RelayCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = this.configManager.getConfig(RelayCommand.DEPLOY_CONFIGS_NAME, allFlags, [
              'nodeAliases',
            ]) as RelayDeployConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );
            context_.config.nodeAliases = helpers.parseNodeAliases(
              context_.config.nodeAliasesUnparsed,
              this.remoteConfig.getConsensusNodes(),
              this.configManager,
            );

            context_.config.releaseName = this.prepareReleaseName();

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            const context: Context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];
            if (context) {
              context_.config.context = context;
            }

            const nodeIds: NodeId[] = context_.config.nodeAliases.map((nodeAlias: NodeAlias): number =>
              Templates.nodeIdFromNodeAlias(nodeAlias),
            );

            context_.config.newRelayComponent = this.componentFactory.createNewRelayComponent(
              context_.config.clusterRef,
              context_.config.namespace,
              nodeIds,
            );

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            await this.accountManager.loadNodeClient(
              context_.config.namespace,
              this.remoteConfig.getClusterRefs(),
              this.configManager.getFlag<DeploymentName>(flags.deployment),
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            config.valuesArg = await this.prepareValuesArgForRelay(
              config.valuesFile,
              config.nodeAliases,
              config.chainId,
              config.relayReleaseTag,
              config.replicaCount,
              config.operatorId,
              config.operatorKey,
              config.namespace,
              config.domainName,
              config.context,
              config.releaseName,
            );
          },
        },
        {
          title: 'Deploy JSON RPC Relay',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              constants.JSON_RPC_RELAY_CHART,
              constants.JSON_RPC_RELAY_CHART,
              '',
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, HEDERA_JSON_RPC_RELAY_VERSION);
          },
        },
        {
          title: 'Check relay is running',
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  Templates.renderRelayLabels(context_.config.newRelayComponent.metadata.id),
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
          task: async (context_): Promise<void> => {
            const config: RelayDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  Templates.renderRelayLabels(context_.config.newRelayComponent.metadata.id),
                  constants.RELAY_PODS_READY_MAX_ATTEMPTS,
                  constants.RELAY_PODS_READY_DELAY,
                );
            } catch (error) {
              throw new SoloError(`Relay ${config.releaseName} is not ready: ${error.message}`, error);
            }
          },
        },
        this.addRelayComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying relay: ${error.message}`, error);
    } finally {
      await lease.release();
      await this.accountManager.close();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<RelayDestroyContext> = new Listr<RelayDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            this.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef, flags.id, flags.nodeAliasesUnparsed]);

            const allFlags: CommandFlag[] = [
              ...RelayCommand.DESTROY_FLAGS_LIST.required,
              ...RelayCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = {
              chartDirectory: this.configManager.getFlag(flags.chartDirectory),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(
                this.configManager.getFlag(flags.nodeAliasesUnparsed),
                this.remoteConfig.getConsensusNodes(),
                this.configManager,
              ),
              clusterRef: this.configManager.getFlag(flags.clusterRef),
              id: this.configManager.getFlag<number>(flags.id),
              useLegacyReleaseName: false,
            } as RelayDestroyConfigClass;

            if (context_.config.clusterRef) {
              const context: Context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];
              if (context) {
                context_.config.context = context;
              }
            }

            if (typeof context_.config.id !== 'number') {
              context_.config.id = this.remoteConfig.configuration.components.state.relayNodes[0]?.metadata?.id;
              context_.config.nodeAliases =
                this.remoteConfig.configuration.components.state.relayNodes[0]?.consensusNodeIds.map(
                  (nodeId: NodeId): NodeAlias => Templates.renderNodeAliasFromNumber(nodeId + 1),
                );
            }

            context_.config.releaseName = this.prepareReleaseName(context_.config.id);

            if (context_.config.id === 1) {
              context_.config.nodeAliases = this.remoteConfig.configuration.components
                .getComponentById<RelayNodeStateSchema>(ComponentTypes.RelayNodes, context_.config.id)
                ?.consensusNodeIds.map((nodeId: NodeId): NodeAlias => Templates.renderNodeAliasFromNumber(nodeId + 1));

              const isLegacyChartInstalled: boolean = await this.chartManager.isChartInstalled(
                context_.config.namespace,
                this.prepareLegacyReleaseName(context_.config.nodeAliases),
                context_.config.context,
              );

              if (isLegacyChartInstalled) {
                context_.config.isChartInstalled = true;
                context_.config.useLegacyReleaseName = true;
                context_.config.releaseName = this.prepareLegacyReleaseName(context_.config.nodeAliases);
              }
            }

            if (!context_.config.isChartInstalled) {
              context_.config.isChartInstalled = await this.chartManager.isChartInstalled(
                context_.config.namespace,
                context_.config.releaseName,
                context_.config.context,
              );
            }

            if (!context_.config.id) {
              throw new SoloError('Relay Node is not found');
            }

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async (context_): Promise<void> => {
            const config: RelayDestroyConfigClass = context_.config;

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
      await lease.release();
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
              self.logger.info("==== Running 'relay deploy' ===", {argv});
              self.logger.info(argv);

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
              self.logger.info("==== Running 'relay destroy' ===", {argv});
              self.logger.debug(argv);

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
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        const {namespace, nodeAliases, clusterRef} = context_.config;

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
      task: async (context_): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(context_.config.id, ComponentTypes.RelayNodes);

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
