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
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
  type Optional,
  type Realm,
  type Shard,
  type SoloListrTask,
} from '../types/index.js';
import {ErrorMessages} from '../core/error-messages.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {container, inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type ArgvStruct, type NodeAliases} from '../types/aliases.js';
import {Templates} from '../core/templates.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {DeploymentStates} from '../core/config/remote/enumerations/deployment-states.js';
import {LedgerPhase} from '../data/schema/model/remote/ledger-phase.js';
import {StringFacade} from '../business/runtime-state/facade/string-facade.js';
import {Deployment} from '../business/runtime-state/config/local/deployment.js';
import {CommandFlags} from '../types/flag-types.js';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type FacadeArray} from '../business/runtime-state/collection/facade-array.js';

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
  public constructor(@inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
  }

  public static CREATE_FLAGS_LIST: CommandFlags = {
    required: [flags.namespace, flags.deployment],
    optional: [flags.quiet, flags.realm, flags.shard],
  };

  public static DESTROY_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet],
  };

  public static ADD_CLUSTER_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.clusterRef],
    optional: [
      flags.quiet,
      flags.enableCertManager,
      flags.numberOfConsensusNodes,
      flags.dnsBaseDomain,
      flags.dnsConsensusNodePattern,
    ],
  };

  public static LIST_DEPLOYMENTS_FLAGS_LIST: CommandFlags = {
    required: [flags.clusterRef],
    optional: [flags.quiet],
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
      'deployment config create',
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
    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
    }

    interface Context {
      config: Config;
    }

    const tasks = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();
            try {
              await this.remoteConfig.loadAndValidate(argv);
            } catch {
              // Guard
            }

            this.configManager.update(argv);

            await this.configManager.executePrompt(task, [flags.deployment]);

            context_.config = {
              quiet: this.configManager.getFlag(flags.quiet),
              deployment: this.configManager.getFlag(flags.deployment),
            } as Config;

            const deployment: DeploymentName = context_.config.deployment;

            if (!this.localConfig.configuration.deployments?.some((d): boolean => d.name === deployment)) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(deployment));
            }
          },
        },
        {
          title: 'Check for existing remote resources',
          task: async ({config: {deployment}}): Promise<void> => {
            const clusterReferences: FacadeArray<StringFacade, string> =
              this.localConfig.configuration.deploymentByName(deployment).clusters;

            for (const clusterReferenceFacade of clusterReferences) {
              const clusterReference: ClusterReferenceName = clusterReferenceFacade.toString();

              const namespace: NamespaceName = NamespaceName.of(
                this.localConfig.configuration.deploymentByName(deployment).namespace,
              );

              const context: Optional<string> = this.localConfig.configuration.clusterRefs
                .get(clusterReference)
                ?.toString();

              const remoteConfigExists: boolean = await this.remoteConfig
                .remoteConfigExists(namespace, context)
                .catch((): boolean => false);

              const namespaceExists: boolean = await this.k8Factory.getK8(context).namespaces().has(namespace);

              const existingConfigMaps: ConfigMap[] = await this.k8Factory
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
          task: async ({config: {deployment}}): Promise<void> => {
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
      undefined,
      'deployment config delete',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error: Error | unknown) {
        throw new SoloError('Error deleting deployment', error);
      }
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
      'deployment cluster attach',
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

  public async list(argv: ArgvStruct): Promise<boolean> {
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
      throw new SoloError('Error listing deployments for cluster', error);
    }

    return true;
  }

  public async close(): Promise<void> {} // no-op

  /**
   * Initializes and populates the config and context for 'deployment cluster attach'
   */
  public initializeClusterAddConfig(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;

    return {
      title: 'Initialize',
      task: async (context_, task): Promise<void> => {
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
