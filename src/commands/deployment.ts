// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {type ClusterCommandTasks} from './cluster/tasks.js';
import {
  type ClusterReferenceName,
  type CommandDefinition,
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
  type Realm,
  type Shard,
  type SoloListrTask,
} from '../types/index.js';
import {ErrorMessages} from '../core/error-messages.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {container, inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type AnyYargs, type ArgvStruct, type NodeAliases} from '../types/aliases.js';
import {Templates} from '../core/templates.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {DeploymentStates} from '../core/config/remote/enumerations/deployment-states.js';
import {LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';
import {type ComponentFactoryApi} from '../core/config/remote/api/component-factory-api.js';
import {StringFacade} from '../business/runtime-state/facade/string-facade.js';
import {Deployment} from '../business/runtime-state/config/local/deployment.js';

interface DeploymentAddClusterConfig {
  quiet: boolean;
  context: string;
  namespace: NamespaceName;
  deployment: DeploymentName;
  clusterRef: ClusterReferenceName;

  enableCertManager: boolean;
  numberOfConsensusNodes: number;
  dnsBaseDomain: string;
  dnsConsensusNodePattern: string;

  ledgerPhase?: LedgerPhase;
  nodeAliases: NodeAliases;

  existingNodesCount: number;
  existingClusterContext?: string;
}

export interface DeploymentAddClusterContext {
  config: DeploymentAddClusterConfig;
}

@injectable()
export class DeploymentCommand extends BaseCommand {
  public static readonly CREATE_COMMAND: string = 'deployment create';
  public static readonly ADD_COMMAND: string = 'deployment add-cluster';

  public constructor(
    @inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
  ) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
  }

  public static readonly COMMAND_NAME = 'deployment';

  private static CREATE_FLAGS_LIST = {
    required: [],
    optional: [flags.quiet, flags.namespace, flags.deployment, flags.realm, flags.shard],
  };

  private static DELETE_FLAGS_LIST = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  private static ADD_CLUSTER_FLAGS_LIST = {
    required: [],
    optional: [
      flags.quiet,
      flags.deployment,
      flags.clusterRef,
      flags.enableCertManager,
      flags.numberOfConsensusNodes,
      flags.dnsBaseDomain,
      flags.dnsConsensusNodePattern,
    ],
  };

  private static LIST_DEPLOYMENTS_FLAGS_LIST = {
    required: [],
    optional: [flags.quiet, flags.clusterRef],
  };

  /**
   * Create new deployment inside the local config
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
      realm: Realm;
      shard: Shard;
    }

    interface Context {
      config: Config;
    }

    const tasks = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();

            self.configManager.update(argv);

            await self.configManager.executePrompt(task, [flags.namespace, flags.deployment]);

            context_.config = {
              quiet: self.configManager.getFlag<boolean>(flags.quiet),
              namespace: self.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              realm: self.configManager.getFlag<Realm>(flags.realm) || flags.realm.definition.defaultValue,
              shard: self.configManager.getFlag<Shard>(flags.shard) || flags.shard.definition.defaultValue,
            } as Config;

            if (
              self.localConfig.configuration.deployments &&
              self.localConfig.configuration.deployments.some(
                (d: Deployment): boolean => d.name === context_.config.deployment,
              )
            ) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(context_.config.deployment));
            }
          },
        },
        {
          title: 'Add deployment to local config',
          task: async (context_, task) => {
            const {namespace, deployment, realm, shard} = context_.config;
            task.title = `Adding deployment: ${deployment} with namespace: ${namespace.name} to local config`;

            if (this.localConfig.configuration.deployments.some((d: Deployment): boolean => d.name === deployment)) {
              throw new SoloError(`Deployment ${deployment} is already added to local config`);
            }

            const actualDeployment: Deployment = this.localConfig.configuration.deployments.addNew();
            actualDeployment.name = deployment;
            actualDeployment.namespace = namespace.name;
            actualDeployment.realm = realm;
            actualDeployment.shard = shard;

            await this.localConfig.persist();
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      DeploymentCommand.CREATE_COMMAND,
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error: Error | unknown) {
        throw new SoloError('Error creating deployment', error);
      }
    }

    return true;
  }

  /**
   * Delete a deployment from the local config
   */
  public async delete(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
    }

    interface Context {
      config: Config;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();
            await self.remoteConfig.loadAndValidate(argv);

            self.configManager.update(argv);

            await self.configManager.executePrompt(task, [flags.deployment]);

            context_.config = {
              quiet: self.configManager.getFlag<boolean>(flags.quiet),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
            } as Config;

            if (
              !self.localConfig.configuration.deployments ||
              !self.localConfig.configuration.deployments.some(
                (d: Deployment): boolean => d.name === context_.config.deployment,
              )
            ) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(context_.config.deployment));
            }
          },
        },
        {
          title: 'Check for existing remote resources',
          task: async (context_): Promise<void> => {
            const {deployment} = context_.config;
            const clusterReferences = self.localConfig.configuration.deploymentByName(deployment).clusters;
            for (const clusterReference of clusterReferences) {
              const context = self.localConfig.configuration.clusterRefs.get(clusterReference.toString()).toString();
              const namespace = NamespaceName.of(self.localConfig.configuration.deploymentByName(deployment).namespace);
              const remoteConfigExists: boolean = await self.remoteConfig.remoteConfigExists(namespace, context);
              const namespaceExists = await self.k8Factory.getK8(context).namespaces().has(namespace);
              const existingConfigMaps = await self.k8Factory
                .getK8(context)
                .configMaps()
                .list(namespace, ['app.kubernetes.io/managed-by=Helm']);
              if (remoteConfigExists || namespaceExists || existingConfigMaps.length > 0) {
                throw new SoloError(`Deployment ${deployment} has remote resources in cluster: ${clusterReference}`);
              }
            }
          },
        },
        {
          title: 'Remove deployment from local config',
          task: async context_ => {
            const {deployment} = context_.config;

            const actualDeployment: Deployment = this.localConfig.configuration.deploymentByName(deployment);
            if (actualDeployment) {
              this.localConfig.configuration.deployments.remove(actualDeployment);
            }

            await this.localConfig.persist();
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
    } catch (error: Error | unknown) {
      throw new SoloError('Error deleting deployment', error);
    }

    return true;
  }

  /**
   * Add new cluster for specified deployment, and create or edit the remote config
   */
  public async addCluster(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    const tasks = this.taskList.newTaskList(
      [
        self.initializeClusterAddConfig(argv),
        self.verifyClusterAddArgs(),
        self.checkNetworkState(),
        self.testClusterConnection(),
        self.verifyClusterAddPrerequisites(),
        self.addClusterRefToDeployments(),
        self.createOrEditRemoteConfigForNewDeployment(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      DeploymentCommand.ADD_COMMAND,
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error: Error | unknown) {
        throw new SoloError('Error adding cluster to deployment', error);
      }
    }

    return true;
  }

  private async list(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      clusterName: ClusterReferenceName;
    }

    interface Context {
      config: Config;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await self.localConfig.load();

            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.clusterRef]);
            context_.config = {
              clusterName: self.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),
            } as Config;
          },
        },
        {
          title: 'Validate context',
          task: async context_ => {
            const clusterName = context_.config.clusterName;

            const context = self.localConfig.configuration.clusterRefs.get(clusterName)?.toString();

            self.k8Factory.default().contexts().updateCurrent(context);

            const namespaces = await self.k8Factory.default().namespaces().list();
            const namespacesWithRemoteConfigs: NamespaceNameAsString[] = [];

            for (const namespace of namespaces) {
              const isFound: boolean = await container
                .resolve<ClusterChecks>(InjectTokens.ClusterChecks)
                .isRemoteConfigPresentInNamespace(namespace);
              if (isFound) {
                namespacesWithRemoteConfigs.push(namespace.name);
              }
            }

            self.logger.showList(`Deployments inside cluster: ${chalk.cyan(clusterName)}`, namespacesWithRemoteConfigs);
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
    } catch (error: Error | unknown) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, error);
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: DeploymentCommand.COMMAND_NAME,
      desc: 'Manage solo network deployment',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'create',
            desc: 'Creates a solo deployment',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.CREATE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.CREATE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment create' ===");

              await self
                .create(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment create`====');

                  if (!r) {
                    throw new SoloError('Error creating deployment, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error creating deployment: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'delete',
            desc: 'Deletes a solo deployment',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.DELETE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.DELETE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment delete' ===");

              await self
                .delete(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment delete`====');

                  if (!r) {
                    throw new SoloError('Error deleting deployment, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error deleting deployment: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'list',
            desc: 'List solo deployments inside a cluster',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST.optional);
            },
            handler: async argv => {
              self.logger.info("==== Running 'deployment list' ===");

              await self
                .list(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment list`====');

                  if (!r) {
                    throw new SoloError('Error listing deployments, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error listing deployments: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'add-cluster',
            desc: 'Adds cluster to solo deployments',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.ADD_CLUSTER_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.ADD_CLUSTER_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment add-cluster' ===");

              await self
                .addCluster(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment add-cluster`====');
                  if (!r) {
                    throw new SoloError('Error adding cluster deployment, expected return value to be true');
                  }
                })
                .catch(error => {
                  self.logger.showUserError(error);
                  throw new SoloError(`Error adding cluster deployment: ${error.message}`, error);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  /**
   * Initializes and populates the config and context for 'deployment add-cluster'
   */
  public initializeClusterAddConfig(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Initialize',
      task: async (context_, task) => {
        await self.localConfig.load();

        this.configManager.update(argv);

        await this.configManager.executePrompt(task, [flags.deployment, flags.clusterRef]);

        context_.config = {
          quiet: this.configManager.getFlag<boolean>(flags.quiet),
          namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
          deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
          clusterRef: this.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),

          enableCertManager: this.configManager.getFlag<boolean>(flags.enableCertManager),
          numberOfConsensusNodes: this.configManager.getFlag<number>(flags.numberOfConsensusNodes),
          dnsBaseDomain: this.configManager.getFlag(flags.dnsBaseDomain),
          dnsConsensusNodePattern: this.configManager.getFlag(flags.dnsConsensusNodePattern),

          existingNodesCount: 0,
          nodeAliases: [] as NodeAliases,
          context: '',
        };
      },
    };
  }

  /**
   * Validates:
   * - cluster ref is present in the local config's cluster-ref => context mapping
   * - the deployment is created
   * - the cluster-ref is not already added to the deployment
   */
  public verifyClusterAddArgs(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Verify args',
      task: async context_ => {
        const {clusterRef, deployment} = context_.config;

        if (!this.localConfig.configuration.clusterRefs.get(clusterRef)) {
          throw new SoloError(`Cluster ref ${clusterRef} not found in local config`);
        }

        context_.config.context = this.localConfig.configuration.clusterRefs.get(clusterRef)?.toString();

        if (!this.localConfig.configuration.deploymentByName(deployment)) {
          throw new SoloError(`Deployment ${deployment} not found in local config`);
        }

        if (
          this.localConfig.configuration.deploymentByName(deployment).clusters.includes(new StringFacade(clusterRef))
        ) {
          throw new SoloError(`Cluster ref ${clusterRef} is already added for deployment`);
        }
      },
    };
  }

  /**
   * Checks the ledger phase:
   * - if remote config is found check's the ledgerPhase field to see if it's pre or post genesis.
   *   - pre genesis:
   *     - prompts user if needed.
   *     - generates node aliases based on '--number-of-consensus-nodes'
   *   - post genesis:
   *     - throws if '--number-of-consensus-nodes' is passed
   * - if remote config is not found:
   *   - prompts user if needed.
   *   - generates node aliases based on '--number-of-consensus-nodes'.
   */
  public checkNetworkState(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'check ledger phase',
      task: async (context_, task) => {
        const {deployment, numberOfConsensusNodes, quiet, namespace} = context_.config;

        const existingClusterReferences = this.localConfig.configuration.deploymentByName(deployment).clusters;

        // if there is no remote config don't validate deployment ledger phase
        if (existingClusterReferences.length === 0) {
          context_.config.ledgerPhase = LedgerPhase.UNINITIALIZED;

          // if the user can't be prompted for '--num-consensus-nodes' fail
          if (!numberOfConsensusNodes && quiet) {
            throw new SoloError(`--${flags.numberOfConsensusNodes} must be specified ${DeploymentStates.PRE_GENESIS}`);
          }

          // prompt the user for the '--num-consensus-nodes'
          else if (!numberOfConsensusNodes) {
            await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
            context_.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          }

          context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(context_.config.numberOfConsensusNodes, 0);

          return;
        }

        const existingClusterContext: Context = this.localConfig.configuration.clusterRefs
          .get(existingClusterReferences.get(0)?.toString())
          ?.toString();

        context_.config.existingClusterContext = existingClusterContext;

        await this.remoteConfig.populateFromExisting(namespace, existingClusterContext);

        const ledgerPhase: LedgerPhase = this.remoteConfig.configuration.state.ledgerPhase;

        context_.config.ledgerPhase = ledgerPhase;

        const existingNodesCount: number = Object.keys(this.remoteConfig.configuration.state.consensusNodes).length;

        context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes, existingNodesCount);

        // If ledgerPhase is pre-genesis and user can't be prompted for the '--num-consensus-nodes' fail
        if (ledgerPhase === LedgerPhase.UNINITIALIZED && !numberOfConsensusNodes && quiet) {
          throw new SoloError(`--${flags.numberOfConsensusNodes} must be specified ${LedgerPhase.UNINITIALIZED}`);
        }

        // If ledgerPhase is pre-genesis prompt the user for the '--num-consensus-nodes'
        else if (ledgerPhase === LedgerPhase.UNINITIALIZED && !numberOfConsensusNodes) {
          await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
          context_.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(
            context_.config.numberOfConsensusNodes,
            existingNodesCount,
          );
        }

        // if the ledgerPhase is post-genesis and '--num-consensus-nodes' is specified throw
        else if (ledgerPhase === LedgerPhase.INITIALIZED && numberOfConsensusNodes) {
          throw new SoloError(
            `--${flags.numberOfConsensusNodes.name}=${numberOfConsensusNodes} shouldn't be specified ${ledgerPhase}`,
          );
        }
      },
    };
  }

  /**
   * Tries to connect with the cluster using the context from the local config
   */
  public testClusterConnection(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Test cluster connection',
      task: async (context_, task): Promise<void> => {
        const {clusterRef, context} = context_.config;

        task.title += `: ${clusterRef}, context: ${context}`;

        const isConnected: boolean = await this.k8Factory
          .getK8(context)
          .namespaces()
          .list()
          .then(() => true)
          .catch(() => false);

        if (!isConnected) {
          throw new SoloError(`Connection failed for cluster ${clusterRef} with context: ${context}`);
        }
      },
    };
  }

  public verifyClusterAddPrerequisites(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Verify prerequisites',
      task: async (): Promise<void> => {
        // TODO: Verifies Kubernetes cluster & namespace-level prerequisites (e.g., cert-manager, HAProxy, etc.)
      },
    };
  }

  /**
   * Adds the new cluster-ref for the deployment in local config
   */
  public addClusterRefToDeployments(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'add cluster-ref in local config deployments',
      task: async (context_, task): Promise<void> => {
        const {clusterRef, deployment} = context_.config;

        task.title = `add cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`;

        this.localConfig.configuration.deploymentByName(deployment).clusters.add(new StringFacade(clusterRef));
        await this.localConfig.persist();
      },
    };
  }

  /**
   * - if remote config not found, create new remote config for the deployment.
   * - if remote config is found, add the new data for the deployment.
   */
  public createOrEditRemoteConfigForNewDeployment(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'create remote config for deployment',
      task: async (context_, task): Promise<void> => {
        const {
          deployment,
          clusterRef,
          context,
          ledgerPhase,
          nodeAliases,
          namespace,
          existingClusterContext,
          dnsBaseDomain,
          dnsConsensusNodePattern,
        } = context_.config;

        argv[flags.nodeAliasesUnparsed.name] = nodeAliases.join(',');

        task.title += `: ${deployment} in cluster: ${clusterRef}`;

        if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
          await this.k8Factory.getK8(context).namespaces().create(namespace);
        }

        await (existingClusterContext
          ? this.remoteConfig.createFromExisting(
              namespace,
              clusterRef,
              deployment,
              this.componentFactory,
              dnsBaseDomain,
              dnsConsensusNodePattern,
              existingClusterContext,
              argv,
              nodeAliases,
            )
          : this.remoteConfig.create(
              argv,
              ledgerPhase,
              nodeAliases,
              namespace,
              deployment,
              clusterRef,
              context,
              dnsBaseDomain,
              dnsConsensusNodePattern,
            ));
      },
    };
  }
}
