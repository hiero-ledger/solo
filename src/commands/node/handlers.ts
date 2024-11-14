/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import * as helpers from '../../core/helpers.ts'
import * as NodeFlags from './flags.ts'
import {
  addConfigBuilder, deleteConfigBuilder, downloadGeneratedFilesConfigBuilder, keysConfigBuilder, logsConfigBuilder,
  prepareUpgradeConfigBuilder, refreshConfigBuilder, setupConfigBuilder, startConfigBuilder, stopConfigBuilder,
  updateConfigBuilder
} from './configs.ts'
import {
  type ConfigManager,
  constants,
  type K8,
  type PlatformInstaller,
  type AccountManager,
  type LeaseManager
} from '../../core/index.ts'
import { IllegalArgumentError } from '../../core/errors.ts'
import type { SoloLogger } from '../../core/logging.ts'
import type { NodeCommand } from './index.ts'
import type { NodeCommandTasks } from './tasks.ts'
import { type Lease } from '../../core/lease.js'

export class NodeCommandHandlers {
  private readonly accountManager: AccountManager
  private readonly configManager: ConfigManager
  private readonly platformInstaller: PlatformInstaller
  private readonly logger: SoloLogger
  private readonly k8: K8
  private readonly tasks: NodeCommandTasks
  private readonly leaseManager: LeaseManager

  private getConfig: any
  private prepareChartPath: any

  public readonly parent: NodeCommand

  constructor (opts: any) {
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
    if (!opts || !opts.tasks) throw new Error('An instance of NodeCommandTasks is required')
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)

    this.logger = opts.logger
    this.tasks = opts.tasks
    this.accountManager = opts.accountManager
    this.configManager = opts.configManager
    this.k8 = opts.k8
    this.platformInstaller = opts.platformInstaller
    this.leaseManager = opts.leaseManager

    this.getConfig = opts.parent.getConfig.bind(opts.parent)
    this.prepareChartPath = opts.parent.prepareChartPath.bind(opts.parent)
    this.parent = opts.parent
  }

  static readonly ADD_CONTEXT_FILE = 'node-add.json'
  static readonly DELETE_CONTEXT_FILE = 'node-delete.json'
  static readonly UPDATE_CONTEXT_FILE = 'node-update.json'

  async close () {
    await this.accountManager.close()
    if (this.parent._portForwards) {
      for (const srv of this.parent._portForwards) {
        await this.k8.stopPortForward(srv)
      }
    }

    this.parent._portForwards = []
  }

  /** ******** Task Lists **********/

  deletePrepareTaskList (argv: any, lease: Lease) {
    return [
      this.tasks.initialize(argv, deleteConfigBuilder.bind(this), lease),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  deleteSubmitTransactionsTaskList (argv: any) {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  deleteExecuteTaskList (argv: any) {
    return [
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.refreshNodeList(),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Update chart to use new configMap'),
      this.tasks.killNodes(),
      this.tasks.sleep('Give time for pods to come up after being killed', 20000),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases'),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate(),
      this.tasks.finalize()
    ]
  }

  addPrepareTasks (argv: any, lease: Lease) {
    return [
      this.tasks.initialize(argv, addConfigBuilder.bind(this), lease),
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
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  addSubmitTransactionsTasks (argv: any) {
    return [
      this.tasks.sendNodeCreateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  addExecuteTasks (argv: any) {
    return [
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Deploy new network node'),
      this.tasks.killNodes(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.downloadLastState(),
      this.tasks.uploadStateToNewNode(),
      this.tasks.setupNetworkNodes('allNodeAliases'),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.stakeNewNode(),
      this.tasks.triggerStakeWeightCalculate(),
      this.tasks.finalize()
    ]
  }

  updatePrepareTasks (argv, lease: Lease) {
    return [
      this.tasks.initialize(argv, updateConfigBuilder.bind(this), lease),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
    ]
  }

  updateSubmitTransactionsTasks (argv) {
    return [
      this.tasks.sendNodeUpdateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction(),
    ]
  }

  updateExecuteTasks (argv) {
    return [
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap(
          'Update chart to use new configMap due to account number change',
          (ctx: any) => !ctx.config.newAccountNumber && !ctx.config.debugNodeAlias
      ),
      this.tasks.killNodesAndUpdateConfigMap(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.fetchPlatformSoftware('allNodeAliases'),
      this.tasks.setupNetworkNodes('allNodeAliases'),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate(),
      this.tasks.finalize()
    ]
  }

  /** ******** Handlers **********/

  async prepareUpgrade (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, prepareUpgradeConfigBuilder.bind(this), lease),
      this.tasks.prepareUpgradeZip(),
      this.tasks.sendPrepareUpgradeTransaction()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in preparing node upgrade', lease)

    await action(argv, this)
    return true
  }

  async freezeUpgrade (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS)


    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, prepareUpgradeConfigBuilder.bind(this), null),
      this.tasks.prepareUpgradeZip(),
      this.tasks.sendFreezeUpgradeTransaction()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in executing node freeze upgrade', null)

    await action(argv, this)
    return true
  }

  async downloadGeneratedFiles (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, downloadGeneratedFilesConfigBuilder.bind(this), lease),
      this.tasks.identifyExistingNodes(),
      this.tasks.downloadNodeGeneratedFiles()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in downloading generated files', lease)

    await action(argv, this)
    return true
  }

  async update (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      ...this.updatePrepareTasks(argv, lease),
      ...this.updateSubmitTransactionsTasks(argv),
      ...this.updateExecuteTasks(argv),
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in updating nodes', lease)

    await action(argv, this)
    return true
  }

  async updatePrepare (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_PREPARE_FLAGS)
    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      ...this.updatePrepareTasks(argv, lease),
      this.tasks.saveContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, helpers.updateSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in preparing node update', lease)

    await action(argv, this)
    return true
  }

  async updateSubmitTransactions (argv) {
    const lease = await this.leaseManager.create()
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, updateConfigBuilder.bind(this), lease),
      this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, helpers.updateLoadContextParser),
        ...this.updateSubmitTransactionsTasks(argv)
    ], {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in submitting transactions for node update', lease)

      await action(argv, this)
      return true
  }

  async updateExecute (argv) {
    const lease = await this.leaseManager.create()
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_EXECUTE_FLAGS)
      const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, updateConfigBuilder.bind(this), lease),
      this.tasks.loadContextData(argv, NodeCommandHandlers.UPDATE_CONTEXT_FILE, helpers.updateLoadContextParser),
      ...this.updateExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in executing node update', lease)

    await action(argv, this)
    return true
  }

  async delete (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_FLAGS)
    const lease = await this.leaseManager.create()
    const action = helpers.commandActionBuilder([
      ...this.deletePrepareTaskList(argv, lease),
      ...this.deleteSubmitTransactionsTaskList(argv),
      ...this.deleteExecuteTaskList(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in deleting nodes', lease)

    await action(argv, this)
    return true
  }

  async deletePrepare (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_PREPARE_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      ...this.deletePrepareTaskList(argv, lease),
      this.tasks.saveContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, helpers.deleteSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in preparing to delete a node', lease)

    await action(argv, this)
    return true
  }

  async deleteSubmitTransactions (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, deleteConfigBuilder.bind(this), lease),
      this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      ...this.deleteSubmitTransactionsTaskList(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in deleting a node', lease)

    await action(argv, this)
    return true
  }

  async deleteExecute (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_EXECUTE_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, deleteConfigBuilder.bind(this), lease),
      this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      ...this.deleteExecuteTaskList(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in deleting a node', lease)

    await action(argv, this)
    return true
  }

  async add (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      ...this.addPrepareTasks(argv, lease),
      ...this.addSubmitTransactionsTasks(argv),
      ...this.addExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in adding node', lease)

    await action(argv, this)
    return true
  }

  async addPrepare (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_PREPARE_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      ...this.addPrepareTasks(argv, lease),
      this.tasks.saveContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addSaveContextParser),
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in preparing node', lease)

    await action(argv, this)
    return true
  }

  async addSubmitTransactions (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, addConfigBuilder.bind(this), lease),
      this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      ...this.addSubmitTransactionsTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, '`Error in submitting transactions to node', lease)

    await action(argv, this)
    return true
  }

  async addExecute (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_EXECUTE_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, addConfigBuilder.bind(this), lease),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      ...this.addExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in adding node', lease)

    await action(argv, this)
    return true
  }

  async logs (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.LOGS_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, logsConfigBuilder.bind(this), null),
      this.tasks.getNodeLogsAndConfigs()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in downloading log from nodes', null)

    await action(argv, this)
    return true
  }

  async refresh (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.REFRESH_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, refreshConfigBuilder.bind(this), lease),
      this.tasks.identifyNetworkPods(),
      this.tasks.dumpNetworkNodesSaveState(),
      this.tasks.fetchPlatformSoftware('nodeAliases'),
      this.tasks.setupNetworkNodes('nodeAliases'),
      this.tasks.startNodes('nodeAliases'),
      this.tasks.checkAllNodesAreActive('nodeAliases'),
      this.tasks.checkNodeProxiesAreActive()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in refreshing nodes', lease)

    await action(argv, this)
    return true
  }

  async keys (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.KEYS_FLAGS)

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, keysConfigBuilder.bind(this), null),
      this.tasks.generateGossipKeys(),
      this.tasks.generateGrpcTlsKeys(),
      this.tasks.finalize()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error generating keys', null)

    await action(argv, this)
    return true
  }

  async stop (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STOP_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, stopConfigBuilder.bind(this), lease),
      this.tasks.identifyNetworkPods(),
      this.tasks.stopNodes()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error stopping node', lease)

    await action(argv, this)
    return true
  }

  async start (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.START_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, startConfigBuilder.bind(this), lease),
      this.tasks.identifyExistingNodes(),
      this.tasks.startNodes('nodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('nodeAliases'),
      this.tasks.checkNodeProxiesAreActive(),
      this.tasks.addNodeStakes()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error starting node', lease)

    await action(argv, this)
    return true
  }

  async setup (argv: any) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.SETUP_FLAGS)

    const lease = await this.leaseManager.create()

    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, setupConfigBuilder.bind(this), lease),
      this.tasks.identifyNetworkPods(),
      this.tasks.fetchPlatformSoftware('nodeAliases'),
      this.tasks.setupNetworkNodes('nodeAliases')
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in setting up nodes', lease)

    await action(argv, this)
    return true
  }
}
