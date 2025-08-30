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
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type ArgvStruct, type NodeAlias, type NodeAliases, type NodeId} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as Base64 from 'js-base64';
import {type ClusterReferenceName, type DeploymentName, type Optional, type SoloListrTask} from '../types/index.js';
import {HEDERA_JSON_RPC_RELAY_VERSION} from '../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Templates} from '../core/templates.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';
import {Lock} from '../core/lock/lock.js';
import {CommandFlags} from '../types/flag-types.js';
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
  forcePortForward: Optional<boolean>;
  cacheDir: Optional<string>;
}

interface RelayDeployContext {
  config: RelayDeployConfigClass;
}

@injectable()
export class RelayCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
  ) {
    super();

    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [
      flags.chainId,
      flags.chartDirectory,
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
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.chartDirectory, flags.clusterRef, flags.nodeAliasesUnparsed, flags.quiet, flags.devMode],
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
    context?: Optional<string>,
  ): Promise<string> {
    let valuesArgument = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForRpcRelayChart(profileName);
    if (profileValuesFile) {
      valuesArgument += helpers.prepareValuesFiles(profileValuesFile);
    }

    // TODO need to change this so that the json rpc relay does not have to be in the same cluster as the mirror node
    valuesArgument += ' --install';
    valuesArgument += ' --set ws.enabled=true';
    valuesArgument += ` --set relay.config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArgument += ` --set relay.config.MIRROR_NODE_URL_WEB3=http://${constants.MIRROR_NODE_RELEASE_NAME}-web3`;
    valuesArgument += ' --set relay.config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false';
    valuesArgument += ' --set relay.config.MIRROR_NODE_RETRY_DELAY=2001';
    valuesArgument += ' --set relay.config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21';

    valuesArgument += ` --set ws.config.MIRROR_NODE_URL=http://${constants.MIRROR_NODE_RELEASE_NAME}-rest`;
    valuesArgument += ' --set ws.config.SUBSCRIPTIONS_ENABLED=true';

    if (chainID) {
      valuesArgument += ` --set relay.config.CHAIN_ID=${chainID}`;
      valuesArgument += ` --set ws.config.CHAIN_ID=${chainID}`;
    }

    if (relayRelease) {
      relayRelease = Version.getValidSemanticVersion(relayRelease, false, 'Relay release');
      valuesArgument += ` --set relay.image.tag=${relayRelease}`;
      valuesArgument += ` --set ws.image.tag=${relayRelease}`;
    }

    if (replicaCount) {
      valuesArgument += ` --set relay.replicaCount=${replicaCount}`;
      valuesArgument += ` --set ws.replicaCount=${replicaCount}`;
    }

    const deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const operatorIdUsing: string = operatorID || this.accountManager.getOperatorAccountId(deploymentName).toString();
    valuesArgument += ` --set relay.config.OPERATOR_ID_MAIN=${operatorIdUsing}`;
    valuesArgument += ` --set ws.config.OPERATOR_ID_MAIN=${operatorIdUsing}`;

    if (operatorKey) {
      // use user provided operatorKey if available
      valuesArgument += ` --set relay.config.OPERATOR_KEY_MAIN=${operatorKey}`;
      valuesArgument += ` --set ws.config.OPERATOR_KEY_MAIN=${operatorKey}`;
    } else {
      try {
        const namespace = NamespaceName.of(this.localConfig.configuration.deploymentByName(deploymentName).namespace);

        const k8 = this.k8Factory.getK8(context);
        const secrets = await k8.secrets().list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);
        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);
          valuesArgument += ` --set relay.config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
          valuesArgument += ` --set ws.config.OPERATOR_KEY_MAIN=${constants.OPERATOR_KEY}`;
        } else {
          this.logger.info('Using operator key from k8s secret');
          const operatorKeyFromK8 = Base64.decode(secrets[0].data.privateKey);
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

    const networkJsonString: string = await this.prepareNetworkJsonString(nodeAliases, namespace);
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
  private async prepareNetworkJsonString(nodeAliases: NodeAliases = [], namespace: NamespaceName): Promise<string> {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    const networkIds = {};

    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const accountMap = this.accountManager.getNodeAccountMap(nodeAliases, deploymentName);
    const networkNodeServicesMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
    );
    for (const nodeAlias of nodeAliases) {
      const haProxyClusterIp = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyGrpcPort = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      const networkKey = `${haProxyClusterIp}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    }

    return JSON.stringify(networkIds);
  }

  private prepareReleaseName(nodeAliases: NodeAliases = []): string {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified');
    }

    let releaseName = 'relay';
    for (const nodeAlias of nodeAliases) {
      releaseName += `-${nodeAlias}`;
    }

    return releaseName;
  }

  public async add(argv: ArgvStruct) {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            self.configManager.update(argv);

            flags.disablePrompts([
              flags.operatorId,
              flags.operatorKey,
              flags.clusterRef,
              flags.profileFile,
              flags.profileName,
              flags.forcePortForward,
            ]);

            const allFlags = [...RelayCommand.DEPLOY_FLAGS_LIST.required, ...RelayCommand.DEPLOY_FLAGS_LIST.optional];
            await self.configManager.executePrompt(task, allFlags);

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
            context_.config.releaseName = self.prepareReleaseName(context_.config.nodeAliases);

            if (context_.config.clusterRef) {
              const context: string = self.remoteConfig.getClusterRefs().get(context_.config.clusterRef);
              if (context) {
                context_.config.context = context;
              }
            }

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async context_ => {
            const config = context_.config;

            config.isChartInstalled = await self.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async context_ => {
            const config = context_.config;
            await self.accountManager.loadNodeClient(
              context_.config.namespace,
              self.remoteConfig.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            config.valuesArg = await self.prepareValuesArgForRelay(
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
            );
          },
        },
        {
          title: 'Deploy JSON RPC Relay',
          task: async context_ => {
            const config = context_.config;

            await self.chartManager.upgrade(
              config.namespace,
              config.releaseName,
              constants.JSON_RPC_RELAY_CHART,
              constants.JSON_RPC_RELAY_CHART,
              '',
              config.valuesArg,
              config.context,
            );

            showVersionBanner(self.logger, config.releaseName, HEDERA_JSON_RPC_RELAY_VERSION);
            await helpers.sleep(Duration.ofSeconds(40)); // wait for the pod to destroy in case it was an upgrade
          },
        },
        {
          title: 'Check relay is running',
          task: async context_ => {
            const config = context_.config;

            await self.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                [`app.kubernetes.io/instance=${config.releaseName}`],
                constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
                constants.RELAY_PODS_RUNNING_DELAY,
              );

            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
        },
        {
          title: 'Check relay is ready',
          task: async context_ => {
            const config = context_.config;
            const k8 = self.k8Factory.getK8(config.context);
            try {
              await k8
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  [`app.kubernetes.io/instance=${config.releaseName}`],
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
          title: 'Enable port forwarding for relay node',
          task: async (context_): Promise<void> => {
            const pods: Pod[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pods()
              .list(context_.config.namespace, ['app.kubernetes.io/name=relay']);
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
              this.k8Factory.getK8(context_.config.clusterContext),
              this.logger,
              ComponentTypes.RelayNodes,

              'JSON RPC Relay',
              context_.config.isChartInstalled, // Reuse existing port if chart is already installed
            );
          },
          skip: context_ => !context_.config.forcePortForward,
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
      'relay node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError(`Error deploying relay: ${error.message}`, error);
      } finally {
        if (lease) {
          await lease?.release();
        }
        await self.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await lease?.release();
        await self.accountManager.close();
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct) {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    let lease: Lock;

    const tasks = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);
            lease = await self.leaseManager.create();

            // reset nodeAlias
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const allFlags = [...RelayCommand.DESTROY_FLAGS_LIST.required, ...RelayCommand.DESTROY_FLAGS_LIST.optional];
            await self.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = {
              chartDirectory: self.configManager.getFlag(flags.chartDirectory),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(
                self.configManager.getFlag(flags.nodeAliasesUnparsed),
                this.remoteConfig.getConsensusNodes(),
                this.configManager,
              ),
              clusterRef:
                (this.configManager.getFlag<string>(flags.clusterRef) as string) ??
                this.k8Factory.default().clusters().readCurrent(),
            } as RelayDestroyConfigClass;

            if (context_.config.clusterRef) {
              const context = self.remoteConfig.getClusterRefs()[context_.config.clusterRef];
              if (context) {
                context_.config.context = context;
              }
            }

            context_.config.releaseName = this.prepareReleaseName(context_.config.nodeAliases);
            context_.config.isChartInstalled = await this.chartManager.isChartInstalled(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.context,
            );

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async context_ => {
            const config = context_.config;

            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);

            // reset nodeAliasesUnparsed
            self.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
          skip: context_ => !context_.config.isChartInstalled,
        },
        this.disableRelayComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      'relay node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloError('Error uninstalling relays', error);
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

  /** Adds the relay component to remote config. */
  public addRelayComponent(): SoloListrTask<RelayDeployContext> {
    return {
      title: 'Add relay component in remote config',
      skip: context_ => !this.remoteConfig.isLoaded() || context_.config.isChartInstalled,
      task: async (context_): Promise<void> => {
        const {namespace, nodeAliases} = context_.config;

        const nodeIds: NodeId[] = nodeAliases.map((nodeAlias: NodeAlias) => Templates.nodeIdFromNodeAlias(nodeAlias));
        const clusterReference: string =
          (this.configManager.getFlag<string>(flags.clusterRef) as string) ??
          this.k8Factory.default().clusters().readCurrent();
        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewRelayComponent(clusterReference, namespace, nodeIds),
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
        const clusterReference: ClusterReferenceName = context_.config.clusterRef;

        // if clusterReference not defined then we will remove all relay nodes
        const relayComponents: RelayNodeStateSchema[] = clusterReference
          ? this.remoteConfig.configuration.components.getComponentsByClusterReference<RelayNodeStateSchema>(
              ComponentTypes.RelayNodes,
              clusterReference,
            )
          : this.remoteConfig.configuration.components.getComponentByType<RelayNodeStateSchema>(
              ComponentTypes.RelayNodes,
            );

        if (relayComponents.length === 0) {
          this.logger.showUser(
            `Did not find any relay node in remote config to be removed, clusterReference = ${clusterReference}`,
          );
          return;
        }
        for (const relayComponent of relayComponents) {
          this.remoteConfig.configuration.components.removeComponent(
            relayComponent.metadata.id,
            ComponentTypes.RelayNodes,
          );
        }

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
