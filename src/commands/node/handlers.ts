// SPDX-License-Identifier: Apache-2.0

import * as helpers from '../../core/helpers.js';
import * as NodeFlags from './flags.js';
import {type NodeCommandConfigs} from './configs.js';
import * as constants from '../../core/constants.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {type Lock} from '../../core/lock/lock.js';
import {LeaseWrapper, type NodeCommandTasks} from './tasks.js';
import {NodeSubcommandType} from '../../core/enumerations.js';
import {NodeHelper} from './helper.js';
import {type ArgvStruct, type NodeAlias, type NodeAliases, NodeId} from '../../types/aliases.js';
import chalk from 'chalk';
import {type Optional, SoloListr, type SoloListrTask} from '../../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {CommandHandler} from '../../core/command-handler.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type ConsensusNode} from '../../core/model/consensus-node.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type NodeDestroyContext} from './config-interfaces/node-destroy-context.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {Templates} from '../../core/templates.js';
import {ConsensusNodeStateSchema} from '../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {ComponentsDataWrapperApi} from '../../core/config/remote/api/components-data-wrapper-api.js';
import {LedgerPhase} from '../../data/schema/model/remote/ledger-phase.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';

@injectable()
export class NodeCommandHandlers extends CommandHandler {
  public constructor(
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.NodeCommandTasks) private readonly tasks: NodeCommandTasks,
    @inject(InjectTokens.NodeCommandConfigs) private readonly configs: NodeCommandConfigs,
  ) {
    super();
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.NodeCommandConfigs, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.tasks = patchInject(tasks, InjectTokens.NodeCommandTasks, this.constructor.name);
  }

  private static readonly ADD_CONTEXT_FILE = 'node-add.json';
  private static readonly DESTROY_CONTEXT_FILE = 'node-destroy.json';
  private static readonly UPDATE_CONTEXT_FILE = 'node-update.json';
  private static readonly UPGRADE_CONTEXT_FILE = 'node-upgrade.json';

  /** ******** Task Lists **********/

  private destroyPrepareTaskList(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeDestroyContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.destroyConfigBuilder.bind(this.configs), lease),
      this.validateSingleNodeState({excludedPhases: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private destroySubmitTransactionsTaskList(): SoloListrTask<NodeDestroyContext>[] {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeDestroyContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeDestroyContext>,
    ];
  }

  private destroyExecuteTaskList(): SoloListrTask<NodeDestroyContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.stopNodes('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.refreshNodeList(),
      this.tasks.copyNodeKeysToSecrets('refreshedConsensusNodes'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Delete network node and update configMaps', NodeSubcommandType.DESTROY),
      this.tasks.killNodes(),
      this.tasks.sleep('Give time for pods to come up after being killed', 20_000),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate<NodeDestroyContext>(NodeSubcommandType.DESTROY),
      this.tasks.finalize(),
    ];
  }

  private addPrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.addConfigBuilder.bind(this.configs), lease),
      // TODO instead of validating the state we need to do a remote config add component, and we will need to manually
      //  the nodeAlias based on the next available node ID + 1
      // this.validateSingleNodeState({excludedPhases: []}),
      this.tasks.checkPVCsEnabled(),
      this.tasks.identifyExistingNodes(),
      this.tasks.determineNewNodeAccountNumber(),
      this.tasks.copyGrpcTlsCertificates(),
      this.tasks.generateGossipKey(),
      this.tasks.generateGrpcTlsKey(),
      this.tasks.loadSigningKeyCertificate(),
      this.tasks.computeMTLSCertificateHash(),
      this.tasks.prepareGossipEndpoints(),
      this.tasks.prepareGrpcServiceEndpoints(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private addSubmitTransactionsTasks(): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.sendNodeCreateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeAddContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeAddContext>,
    ];
  }

  private addExecuteTasks(): SoloListrTask<NodeAddContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.addNewConsensusNodeToRemoteConfig(),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Deploy new network node', NodeSubcommandType.ADD),
      this.tasks.killNodes(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.downloadLastState(),
      this.tasks.uploadStateToNewNode(),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.stakeNewNode(),
      this.tasks.triggerStakeWeightCalculate<NodeAddContext>(NodeSubcommandType.ADD),
      this.tasks.finalize(),
    ];
  }

  private updatePrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.updateConfigBuilder.bind(this.configs), lease),
      this.validateSingleNodeState({excludedPhases: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private updateSubmitTransactionsTasks(): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.sendNodeUpdateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeUpdateContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeUpdateContext>,
    ];
  }

  private updateExecuteTasks(): SoloListrTask<NodeUpdateContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap(
        'Update chart to use new configMap due to account number change',
        NodeSubcommandType.UPDATE,
        context_ => !context_.config.newAccountNumber && !context_.config.debugNodeAlias,
      ),
      this.tasks.killNodesAndUpdateConfigMap(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases', false),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate<NodeUpdateContext>(NodeSubcommandType.UPDATE),
      this.tasks.finalize(),
    ];
  }

  private upgradePrepareTasks(argv: ArgvStruct, lease: Lock): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.initialize(argv, this.configs.upgradeConfigBuilder.bind(this.configs), lease),
      this.validateAllNodePhases({excludedPhases: []}),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ];
  }

  private upgradeSubmitTransactionsTasks(): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.sendPrepareUpgradeTransaction() as SoloListrTask<NodeUpgradeContext>,
      this.tasks.sendFreezeUpgradeTransaction() as SoloListrTask<NodeUpgradeContext>,
    ];
  }

  private upgradeExecuteTasks(): SoloListrTask<NodeUpgradeContext>[] {
    return [
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.downloadNodeUpgradeFiles(),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.fetchPlatformSoftware('nodeAliases'),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.finalize(),
    ];
  }

  /** ******** Handlers **********/

  public async prepareUpgrade(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.PREPARE_UPGRADE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.prepareUpgradeConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.prepareStagingDirectory('existingNodeAliases'),
        this.tasks.prepareUpgradeZip(),
        this.tasks.sendPrepareUpgradeTransaction(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async freezeUpgrade(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.PREPARE_UPGRADE_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.prepareUpgradeConfigBuilder.bind(this.configs), null),
        this.tasks.identifyExistingNodes(),
        this.tasks.prepareUpgradeZip(),
        this.tasks.sendFreezeUpgradeTransaction(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing node freeze upgrade',
      null,
    );

    return true;
  }

  public async downloadGeneratedFiles(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.downloadGeneratedFilesConfigBuilder.bind(this.configs),
          leaseWrapper.lease,
        ),
        this.tasks.identifyExistingNodes(),
        this.tasks.downloadNodeGeneratedFiles(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading generated files',
      leaseWrapper.lease,
    );

    return true;
  }

  public async update(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.updatePrepareTasks(argv, leaseWrapper.lease),
        ...this.updateSubmitTransactionsTasks(),
        ...this.updateExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in updating consensus nodes',
      leaseWrapper.lease,
    );

    return true;
  }

  public async updatePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.updatePrepareTasks(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing consensus node update',
      leaseWrapper.lease,
    );

    return true;
  }

  public async updateSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: null};
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.updateConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateSubmitTransactionsTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in submitting transactions for consensus node update',
      leaseWrapper.lease,
    );

    return true;
  }

  public async updateExecute(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: null};
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_EXECUTE_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.updateConfigBuilder.bind(this.configs),
          leaseWrapper.lease,

          false,
        ),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, NodeHelper.updateLoadContextParser),
        ...this.updateExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing network upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async upgradePrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.upgradePrepareTasks(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node upgrade',
      leaseWrapper.lease,
    );
    return true;
  }

  public async upgradeSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: null};
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.upgradeConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeSubmitTransactionsTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in submitting transactions for node upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async upgradeExecute(argv: ArgvStruct): Promise<boolean> {
    const leaseWrapper: LeaseWrapper = {lease: null};
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.upgradeConfigBuilder.bind(this.configs),
          leaseWrapper.lease,

          false,
        ),
        this.tasks.loadContextData(argv, NodeCommandHandlers.UPGRADE_CONTEXT_FILE, NodeHelper.upgradeLoadContextParser),
        ...this.upgradeExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in executing network upgrade',
      leaseWrapper.lease,
    );

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPGRADE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.upgradePrepareTasks(argv, leaseWrapper.lease),
        ...this.upgradeSubmitTransactionsTasks(),
        ...this.upgradeExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in upgrade network',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DESTROY_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};
    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.destroyPrepareTaskList(argv, leaseWrapper.lease),
        ...this.destroySubmitTransactionsTaskList(),
        ...this.destroyExecuteTaskList(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in destroying nodes',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroyPrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DESTROY_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.destroyPrepareTaskList(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.DESTROY_CONTEXT_FILE, NodeHelper.deleteSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing to destroy a node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroySubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DESTROY_SUBMIT_TRANSACTIONS_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.destroyConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DESTROY_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.destroySubmitTransactionsTaskList(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting a node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async destroyExecute(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DESTROY_EXECUTE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.destroyConfigBuilder.bind(this.configs), leaseWrapper.lease, false),
        this.tasks.loadContextData(argv, NodeCommandHandlers.DESTROY_CONTEXT_FILE, NodeHelper.deleteLoadContextParser),
        ...this.destroyExecuteTaskList(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in deleting a node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.addPrepareTasks(argv, leaseWrapper.lease),
        ...this.addSubmitTransactionsTasks(),
        ...this.addExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in adding consensus node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async addPrepare(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_PREPARE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        ...this.addPrepareTasks(argv, leaseWrapper.lease),
        this.tasks.saveContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addSaveContextParser),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in preparing node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async addSubmitTransactions(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.addConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
        ...this.addSubmitTransactionsTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      '`Error in submitting transactions to node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async addExecute(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_EXECUTE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(
          argv,
          this.configs.addConfigBuilder.bind(this.configs),
          leaseWrapper.lease,

          false,
        ),
        this.tasks.identifyExistingNodes(),
        this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
        ...this.addExecuteTasks(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in adding node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async logs(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.LOGS_FLAGS);
    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.logsConfigBuilder.bind(this.configs), null),
        this.tasks.getNodeLogsAndConfigs(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading log from nodes',
      null,
    );

    return true;
  }

  public async states(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STATES_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.statesConfigBuilder.bind(this.configs), null),
        this.tasks.getNodeStateFiles(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in downloading states from nodes',
      null,
    );

    return true;
  }

  // TODO this is broken, since genesis reconnects is no longer supported in 0.59+
  // TODO this is not in the test harness
  public async refresh(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.REFRESH_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.refreshConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({
          acceptedPhases: [DeploymentPhase.STARTED, DeploymentPhase.CONFIGURED, DeploymentPhase.DEPLOYED],
        }),
        this.tasks.identifyNetworkPods(),
        this.tasks.dumpNetworkNodesSaveState(),
        this.tasks.fetchPlatformSoftware('nodeAliases'),
        this.tasks.setupNetworkNodes('nodeAliases', true),
        this.tasks.startNodes('nodeAliases'),
        this.tasks.checkAllNodesAreActive('nodeAliases'),
        this.tasks.checkNodeProxiesAreActive(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in refreshing nodes',
      leaseWrapper.lease,
    );

    return true;
  }

  public async keys(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.KEYS_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.keysConfigBuilder.bind(this.configs), null),
        this.tasks.generateGossipKeys(),
        this.tasks.generateGrpcTlsKeys(),
        this.tasks.finalize(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error generating keys',
      null,
      'keys consensus generate',
    );

    return true;
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STOP_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.stopConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({
          acceptedPhases: [DeploymentPhase.STARTED, DeploymentPhase.CONFIGURED],
        }),
        this.tasks.identifyNetworkPods(1),
        this.tasks.stopNodes('nodeAliases'),
        this.changeAllNodePhases(DeploymentPhase.STARTED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error stopping node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async start(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.START_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.startConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({acceptedPhases: [DeploymentPhase.CONFIGURED]}),
        this.tasks.identifyExistingNodes(),
        this.tasks.uploadStateFiles(context_ => context_.config.stateFile.length === 0),
        this.tasks.startNodes('nodeAliases'),
        this.tasks.enablePortForwarding(true),
        this.tasks.checkAllNodesAreActive('nodeAliases'),
        this.tasks.checkNodeProxiesAreActive(),
        this.changeAllNodePhases(DeploymentPhase.STARTED, LedgerPhase.INITIALIZED),
        this.tasks.addNodeStakes(),
        this.tasks.setGrpcWebEndpoint(),
        // TODO only show this if we are not running in quick-start mode
        // this.tasks.showUserMessages(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error starting node',
      leaseWrapper.lease,
      'consensus node start',
    );

    return true;
  }

  public async setup(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.SETUP_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.validateAllNodePhases({
          acceptedPhases: [DeploymentPhase.DEPLOYED],
        }),
        this.tasks.identifyNetworkPods(),
        this.tasks.fetchPlatformSoftware('nodeAliases'),
        this.tasks.setupNetworkNodes('nodeAliases', true),
        this.tasks.setupNetworkNodeFolders(),
        this.changeAllNodePhases(DeploymentPhase.CONFIGURED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error in setting up nodes',
      leaseWrapper.lease,
      'consensus node setup',
    );

    return true;
  }

  public async freeze(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.FREEZE_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.freezeConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.sendFreezeTransaction(),
        this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
        this.tasks.stopNodes('existingNodeAliases'),
        this.changeAllNodePhases(DeploymentPhase.FROZEN),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error freezing node',
      leaseWrapper.lease,
    );

    return true;
  }

  public async restart(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.RESTART_FLAGS);
    const leaseWrapper: LeaseWrapper = {lease: null};

    await this.commandAction(
      argv,
      [
        this.tasks.loadConfiguration(argv, leaseWrapper, this.leaseManager),
        this.tasks.initialize(argv, this.configs.restartConfigBuilder.bind(this.configs), leaseWrapper.lease),
        this.tasks.identifyExistingNodes(),
        this.tasks.startNodes('existingNodeAliases'),
        this.tasks.enablePortForwarding(),
        this.tasks.checkAllNodesAreActive('existingNodeAliases'),
        this.tasks.checkNodeProxiesAreActive(),
        this.changeAllNodePhases(DeploymentPhase.STARTED),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'Error restarting node',
      leaseWrapper.lease,
    );

    return true;
  }

  /**
   * Changes the state from all consensus nodes components in remote config.
   *
   * @param phase - to which to change the consensus node component
   * @param ledgerPhase
   */
  public changeAllNodePhases(
    phase: DeploymentPhase,
    ledgerPhase: Optional<LedgerPhase> = undefined,
  ): SoloListrTask<any> {
    interface Context {
      config: {namespace: NamespaceName; consensusNodes: ConsensusNode[]};
    }

    return {
      title: `Change node state to ${phase} in remote config`,
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_: Context): Promise<void> => {
        for (const consensusNode of context_.config.consensusNodes) {
          const nodeId: NodeId = Templates.nodeIdFromNodeAlias(consensusNode.name);
          this.remoteConfig.configuration.components.changeNodePhase(nodeId, phase);
        }

        if (ledgerPhase) {
          this.remoteConfig.configuration.state.ledgerPhase = ledgerPhase;
        }

        await this.remoteConfig.persist();
      },
    };
  }

  /**
   * Creates tasks to validate that each node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedPhases - the state at which the nodes can be, not matching any of the states throws an error
   * @param excludedPhases - the state at which the nodes can't be, matching any of the states throws an error
   */
  public validateAllNodePhases({
    acceptedPhases,
    excludedPhases,
  }: {
    acceptedPhases?: DeploymentPhase[];
    excludedPhases?: DeploymentPhase[];
  }): SoloListrTask<any> {
    interface Context {
      config: {namespace: string; nodeAliases: NodeAliases};
    }

    return {
      title: 'Validate nodes states',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: (context_: Context, task): SoloListr<any> => {
        const nodeAliases: NodeAliases = context_.config.nodeAliases;

        const subTasks: SoloListrTask<Context>[] = nodeAliases.map(nodeAlias => ({
          title: `Validating state for node ${nodeAlias}`,
          task: (_, task): void => {
            const state: DeploymentPhase = this.validateNodeState(
              nodeAlias,
              this.remoteConfig.configuration.components,
              acceptedPhases,
              excludedPhases,
            );

            task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
          },
        }));

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  /**
   * Creates tasks to validate that specific node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedPhases - the state at which the node can be, not matching any of the states throws an error
   * @param excludedPhases - the state at which the node can't be, matching any of the states throws an error
   */
  public validateSingleNodeState({
    acceptedPhases,
    excludedPhases,
  }: {
    acceptedPhases?: DeploymentPhase[];
    excludedPhases?: DeploymentPhase[];
  }): SoloListrTask<any> {
    interface Context {
      config: {namespace: string; nodeAlias: NodeAlias};
    }

    return {
      title: 'Validate nodes state',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: (context_: Context, task): void => {
        const nodeAlias = context_.config.nodeAlias;

        task.title += ` ${nodeAlias}`;

        // TODO: Disabled for now until the node's state mapping is completed
        // const components = this.remoteConfig.components;
        // const state = this.validateNodeState(nodeAlias, components, acceptedPhases, excludedPhases);
        // task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
      },
    };
  }

  /**
   * @param nodeAlias - the alias of the node whose state to validate
   * @param components - the component data wrapper
   * @param acceptedPhases - the state at which the node can be, not matching any of the states throws an error
   * @param excludedPhases - the state at which the node can't be, matching any of the states throws an error
   */
  private validateNodeState(
    nodeAlias: NodeAlias,
    components: ComponentsDataWrapperApi,
    acceptedPhases: Optional<DeploymentPhase[]>,
    excludedPhases: Optional<DeploymentPhase[]>,
  ): DeploymentPhase {
    let nodeComponent: ConsensusNodeStateSchema;
    try {
      nodeComponent = components.getComponent<ConsensusNodeStateSchema>(
        ComponentTypes.ConsensusNode,
        Templates.nodeIdFromNodeAlias(nodeAlias),
      );
    } catch {
      throw new SoloError(`${nodeAlias} not found in remote config`);
    }

    // TODO: Enable once the states have been mapped
    // if (acceptedPhases && !acceptedPhases.includes(nodeComponent.state)) {
    //   const errorMessageData =
    //     `accepted states: ${acceptedPhases.join(', ')}, ` + `current state: ${nodeComponent.state}`;
    //
    //   throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    // }
    //
    // if (excludedPhases && excludedPhases.includes(nodeComponent.state)) {
    //   const errorMessageData =
    //     `excluded states: ${excludedPhases.join(', ')}, ` + `current state: ${nodeComponent.state}`;
    //
    //   throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    // }

    return nodeComponent.metadata.phase;
  }
}
