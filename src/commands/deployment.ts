// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {select as selectPrompt} from '@inquirer/prompts';
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
import {remoteConfigsToDeploymentsTable} from '../core/helpers.js';
import {MessageLevel} from '../core/logging/message-level.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../integration/kube/resources/pod/pod-name.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {type K8} from '../integration/kube/k8.js';
import {type BaseStateSchema} from '../data/schema/model/remote/state/base-state-schema.js';

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
    required: [],
    optional: [flags.clusterRef, flags.quiet],
  };

  public static REFRESH_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet],
  };

  /**
   * Create new deployment inside the local config
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
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
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            await this.configManager.executePrompt(task, [flags.namespace, flags.deployment]);

            context_.config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              namespace: this.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
              realm: this.configManager.getFlag<Realm>(flags.realm) || flags.realm.definition.defaultValue,
              shard: this.configManager.getFlag<Shard>(flags.shard) || flags.shard.definition.defaultValue,
            } as Config;

            if (
              this.localConfig.configuration.deployments &&
              this.localConfig.configuration.deployments.some(
                (d: Deployment): boolean => d.name === context_.config.deployment,
              )
            ) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(context_.config.deployment));
            }
          },
        },
        {
          title: 'Add deployment to local config',
          task: async (context_, task): Promise<void> => {
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
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
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
          task: async (context_: Context, task): Promise<void> => {
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

              const existingConfigMaps: ConfigMap[] = await this.k8Factory
                .getK8(context)
                .configMaps()
                .list(namespace, ['app.kubernetes.io/managed-by=Helm']);

              if (remoteConfigExists || existingConfigMaps.length > 0) {
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
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
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
    const tasks = this.taskList.newTaskList(
      [
        this.initializeClusterAddConfig(argv),
        this.verifyClusterAddArgs(),
        this.checkNetworkState(),
        this.testClusterConnection(),
        this.verifyClusterAddPrerequisites(),
        this.checkForExistingDeployments(),
        this.addClusterRefToDeployments(),
        this.createOrEditRemoteConfigForNewDeployment(argv),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
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
    interface Config {
      clusterName?: ClusterReferenceName;
    }

    interface Context {
      config: Config;
    }

    const tasks: Listr<Context, 'default', 'default'> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);
            // Note: cluster-ref is now optional. If not provided, we list local deployments.
            // We no longer prompt for cluster-ref to allow listing all deployments without requiring cluster access.
            context_.config = {
              clusterName: this.configManager.getFlag<ClusterReferenceName>(flags.clusterRef),
            } as Config;
          },
        },
        {
          title: 'List deployments from configured source',
          task: async (context_): Promise<void> => {
            const clusterName: ClusterReferenceName | undefined = context_.config.clusterName;

            if (clusterName) {
              // List deployments in a specific cluster
              const context: string | undefined = this.localConfig.configuration.clusterRefs
                .get(clusterName)
                ?.toString();

              this.k8Factory.default().contexts().updateCurrent(context);

              const namespaces: NamespaceName[] = await this.k8Factory.default().namespaces().list();
              const namespacesWithRemoteConfigs: NamespaceNameAsString[] = [];

              for (const namespace of namespaces) {
                const isFound: boolean = await container
                  .resolve<ClusterChecks>(InjectTokens.ClusterChecks)
                  .isRemoteConfigPresentInNamespace(namespace);
                if (isFound) {
                  namespacesWithRemoteConfigs.push(namespace.name);
                }
              }

              this.logger.showList(
                `Deployments inside cluster: ${chalk.cyan(clusterName)}`,
                namespacesWithRemoteConfigs,
              );
            } else {
              // List all local deployments
              const deploymentNames: string[] = [];
              if (this.localConfig.configuration.deployments) {
                for (const deployment of this.localConfig.configuration.deployments) {
                  deploymentNames.push(deployment.name);
                }
              }

              this.logger.showList('Local deployments', deploymentNames);
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error: Error | unknown) {
      throw new SoloError('Error listing deployments', error);
    }

    return true;
  }

  public async close(): Promise<void> {} // no-op

  /**
   * Initializes and populates the config and context for 'deployment cluster attach'
   */
  public initializeClusterAddConfig(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Initialize',
      task: async (context_, task): Promise<void> => {
        await this.localConfig.load();

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
      task: async (context_): Promise<void> => {
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
      task: async (context_, task): Promise<void> => {
        const {deployment, numberOfConsensusNodes, quiet, namespace} = context_.config;

        const existingClusterReferences: FacadeArray<StringFacade, string> =
          this.localConfig.configuration.deploymentByName(deployment).clusters;

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
      title: 'Test cluster reference connection',
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

  public checkForExistingDeployments(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Check for other deployments',
      task: async (): Promise<void> => {
        await this.showExistingDeploymentsInCluster();
      },
    };
  }

  /**
   * Adds the new cluster-ref for the deployment in local config
   */
  public addClusterRefToDeployments(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'add cluster-ref in local config deployments',
      task: async ({config: {clusterRef, deployment}}, task): Promise<void> => {
        task.title = `add cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`;

        const existsInLocalConfig: boolean = this.localConfig.configuration
          .deploymentByName(deployment)
          .clusters.some((cluster): boolean => cluster.toString() === clusterRef);

        if (existsInLocalConfig) {
          this.logger.showUser(
            `Cluster-ref: ${clusterRef} already exists for deployment: ${deployment} in local config`,
          );
        } else {
          this.logger.showUser(`Adding cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`);
          this.localConfig.configuration.deploymentByName(deployment).clusters.add(new StringFacade(clusterRef));
        }

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

        task.title += `: ${deployment} in cluster reference: ${clusterRef}`;

        if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
          await this.k8Factory.getK8(context).namespaces().create(namespace);
        }

        if (await this.k8Factory.getK8(context).configMaps().exists(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME)) {
          this.logger.showUser(`Remote config already exists for deployment: ${deployment} in cluster: ${clusterRef}`);
          return;
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

  /** Show list of existing deployments in the cluster */
  private async showExistingDeploymentsInCluster(): Promise<void> {
    const existingRemoteConfigs: ConfigMap[] = await this.k8Factory
      .default()
      .configMaps()
      .listForAllNamespaces(Templates.renderConfigMapRemoteConfigLabels());

    if (existingRemoteConfigs.length > 0) {
      const messageGroupName: string = 'existing-deployments';
      this.logger.addMessageGroup(messageGroupName, '⚠️ Warning: Existing solo deployment detected in cluster.');
      const existingDeploymentsRows: string[] = remoteConfigsToDeploymentsTable(existingRemoteConfigs);
      for (const row of existingDeploymentsRows) {
        this.logger.addMessageGroupMessage(messageGroupName, row);
      }
      this.logger.showMessageGroup(messageGroupName, MessageLevel.WARN);
    }
  }

  /**
   * Refresh port-forward processes for all components in the deployment
   */
  public async refresh(argv: ArgvStruct): Promise<boolean> {
    interface Config {
      quiet: boolean;
      deployment: DeploymentName;
    }

    interface RefreshContext {
      config: Config;
      namespace?: NamespaceName;
      clusterReference?: string;
      context?: string;
    }

    const tasks: Listr<RefreshContext, 'default', 'default'> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            context_.config = {
              quiet: this.configManager.getFlag<boolean>(flags.quiet),
              deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
            } as Config;

            // Get namespace from deployment
            const deployment = this.localConfig.configuration.deploymentByName(context_.config.deployment);
            if (!deployment) {
              throw new SoloError(`Deployment ${context_.config.deployment} not found in local config`);
            }

            context_.namespace = NamespaceName.of(deployment.namespace);
          },
        },
        {
          title: 'Load remote configuration',
          task: async (context_, task): Promise<void> => {
            if (!context_.namespace) {
              throw new SoloError('Namespace not set');
            }

            // Load remote config from a selected cluster in the deployment
            const deployment: Deployment = this.localConfig.configuration.deploymentByName(context_.config.deployment);
            const clusters: FacadeArray<StringFacade, string> = deployment.clusters;

            if (clusters.length === 0) {
              throw new SoloError(`No clusters found for deployment ${context_.config.deployment}`);
            }

            const clusterReferences: string[] = [];
            for (let index = 0; index < clusters.length; index++) {
              const clusterReferenceFacade: StringFacade = clusters.get(index);
              if (clusterReferenceFacade) {
                clusterReferences.push(clusterReferenceFacade.toString());
              }
            }

            if (clusterReferences.length === 0) {
              throw new SoloError(`Failed to get cluster reference for deployment ${context_.config.deployment}`);
            }

            let clusterReference: string = clusterReferences[0];
            if (clusterReferences.length > 1) {
              clusterReference = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
                message: `Multiple clusters found for deployment '${context_.config.deployment}'. Select cluster reference:`,
                choices: clusterReferences.map((reference): {name: string; value: string} => ({
                  name: `${reference} (${this.localConfig.configuration.clusterRefs.get(reference)?.toString() ?? 'no-context'})`,
                  value: reference,
                })),
              })) as string;
            }

            const contextValue: StringFacade = this.localConfig.configuration.clusterRefs.get(clusterReference);
            if (!contextValue) {
              throw new SoloError(`Context not found for cluster reference ${clusterReference}`);
            }

            const context: string = contextValue.toString();
            context_.clusterReference = clusterReference;
            context_.context = context;

            await this.remoteConfig.load(context_.namespace, context);
          },
        },
        {
          title: 'Refresh port-forwards for all components',
          task: async (_context_, task): Promise<void> => {
            const componentsToCheck = [
              {type: 'ConsensusNode', components: this.remoteConfig.configuration.state.consensusNodes || []},
              {type: 'BlockNode', components: this.remoteConfig.configuration.state.blockNodes || []},
              {type: 'MirrorNode', components: this.remoteConfig.configuration.state.mirrorNodes || []},
              {type: 'RelayNode', components: this.remoteConfig.configuration.state.relayNodes || []},
              {type: 'Explorer', components: this.remoteConfig.configuration.state.explorers || []},
            ];

            let restoredCount: number = 0;
            let totalChecked: number = 0;
            let alreadyRunningCount: number = 0;
            const portForwardDetails: string[] = [];

            this.logger.showUser(chalk.cyan('\n=== Port-Forward Status Check ===\n'));

            for (const {type, components} of componentsToCheck) {
              for (const component of components) {
                if (!component.metadata?.portForwardConfigs || component.metadata.portForwardConfigs.length === 0) {
                  continue;
                }

                const {cluster: clusterReference, namespace} = component.metadata;
                const context: string | undefined = this.localConfig.configuration.clusterRefs
                  .get(clusterReference)
                  ?.toString();
                const k8Client: K8 = this.k8Factory.getK8(context);

                for (const portForwardConfig of component.metadata.portForwardConfigs) {
                  totalChecked++;
                  const {localPort, podPort} = portForwardConfig;
                  const componentLabel: string = `${type} ${component.metadata.id}`;

                  // Check if port-forward is running
                  const isRunning: boolean = await this.isPortForwardRunning(localPort);

                  if (isRunning) {
                    alreadyRunningCount++;
                    const detail: string = `✓ ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Running]`;
                    portForwardDetails.push(detail);
                    this.logger.showUser(chalk.green(detail));
                  } else {
                    const missingDetail: string = `⚠ ${componentLabel}: localhost:${localPort} -> pod:${podPort} [Missing]`;
                    portForwardDetails.push(missingDetail);
                    this.logger.showUser(chalk.yellow(missingDetail));

                    try {
                      // Find the pod reference for this component
                      const namespaceName: NamespaceName = NamespaceName.of(namespace);
                      const podName: PodName | null = await this.getPodNameForComponent(
                        component,
                        type,
                        k8Client,
                        namespaceName,
                      );

                      if (podName) {
                        // Re-enable port forward
                        const podReference: PodReference = PodReference.of(namespaceName, podName);

                        // portForward parameters:
                        // - localPort: the port to forward to on localhost
                        // - podPort: the port on the pod to forward from
                        // - reuse: true = reuse the configured port number
                        // - persist: false = temporary port-forward (will not restart on failure)
                        await k8Client
                          .pods()
                          .readByReference(podReference)
                          .portForward(localPort, podPort, true, false);

                        const restoredDetail: string = `  ↳ Restored port forward for ${componentLabel}`;
                        this.logger.showUser(chalk.green(restoredDetail));
                        restoredCount++;
                      } else {
                        const errorDetail: string = `  ↳ Could not find pod for ${componentLabel}`;
                        this.logger.showUser(chalk.red(errorDetail));
                      }
                    } catch (error) {
                      const errorDetail: string = `  ↳ Failed to restore: ${error.message}`;
                      this.logger.showUser(chalk.red(errorDetail));
                    }
                  }
                }
              }
            }

            this.logger.showUser(chalk.cyan('\n=== Summary ==='));
            this.logger.showUser(`Total port-forwards configured: ${totalChecked}`);
            this.logger.showUser(chalk.green(`Already running: ${alreadyRunningCount}`));
            if (restoredCount > 0) {
              this.logger.showUser(chalk.green(`Successfully restored: ${restoredCount}`));
            }
            if (totalChecked === 0) {
              this.logger.showUser(chalk.yellow('No port-forwards configured in this deployment'));
            } else if (alreadyRunningCount === totalChecked) {
              this.logger.showUser(chalk.green('✓ All port-forwards are running correctly'));
            }

            task.title = `Checked ${totalChecked} port-forward(s), restored ${restoredCount}`;
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error: Error | unknown) {
      throw new SoloError('Error refreshing port-forwards', error);
    }

    return true;
  }

  /**
   * Check if a port-forward process is running on the specified port
   */
  private async isPortForwardRunning(port: number): Promise<boolean> {
    // Validate port is a positive integer before using it in shell command
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new SoloError(`Invalid port number: ${port}`);
    }

    try {
      const shellCommand: string = `ps -ef | grep "port-forward" | grep "${port}:" | grep -v grep`;
      const result: string[] = await this.run(shellCommand, [], true, false);
      return result && result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the pod name for a component based on its type
   */
  private async getPodNameForComponent(
    component: BaseStateSchema,
    componentType: string,
    k8Client: K8,
    namespace: NamespaceName,
  ): Promise<PodName | null> {
    try {
      const labels: string[] = Templates.renderComponentLabelSelectors(componentType, component.metadata.id);
      if (labels.length === 0) {
        return undefined;
      }

      const pods: Pod[] = await k8Client.pods().list(namespace, labels);
      if (pods?.length > 0) {
        return pods[0].podReference.name;
      }

      return undefined;
    } catch (error) {
      this.logger.warn(`Error finding pod for ${componentType}: ${error.message}`);
      return undefined;
    }
  }
}
