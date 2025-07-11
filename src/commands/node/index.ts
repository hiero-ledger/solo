// SPDX-License-Identifier: Apache-2.0

import {type AccountManager} from '../../core/account-manager.js';
import {BaseCommand} from './../base.js';
import * as NodeFlags from './flags.js';
import {type NodeCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandDefinition} from '../../types/index.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';

/**
 * Defines the core functionalities of 'node' command
 */
@injectable()
export class NodeCommand extends BaseCommand {
  public _portForwards: any;

  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
    @inject(InjectTokens.NodeCommandHandlers) public readonly handlers?: NodeCommandHandlers,
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.handlers = patchInject(handlers, InjectTokens.NodeCommandHandlers, this.constructor.name);
    this._portForwards = [];
  }

  public static readonly COMMAND_NAME: 'consensus' = 'consensus' as const;
  public static readonly SUBCOMMAND_NAME: 'node' = 'node' as const;

  /**
   * stops and closes the port forwards
   * - calls the accountManager.close()
   * - for all portForwards, calls k8Factory.default().pods().readByReference(null).stopPortForward(srv)
   */
  public async close(): Promise<void> {
    await this.accountManager.close();
    if (this._portForwards) {
      for (const srv of this._portForwards) {
        // pass null to readByReference because it isn't needed for stopPortForward()
        await this.k8Factory.default().pods().readByReference(null).stopPortForward(srv);
      }
    }

    this._portForwards = [];
  }

  public getUnusedConfigs(configName: string): string[] {
    return this.handlers.getUnusedConfigs(configName);
  }

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(NodeCommand.COMMAND_NAME, 'Manage Hedera platform node in solo network', this.logger)
      .addCommandGroup(
        new CommandGroup(NodeCommand.SUBCOMMAND_NAME, '')
          .addSubcommand(
            new Subcommand(
              'setup',
              'Setup node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.setup,
              NodeFlags.SETUP_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand('start', 'Start a node', this.handlers, this.handlers.start, NodeFlags.START_FLAGS),
          )
          .addSubcommand(new Subcommand('stop', 'Stop a node', this.handlers, this.handlers.stop, NodeFlags.STOP_FLAGS))
          .addSubcommand(
            new Subcommand(
              'freeze',
              'Freeze all nodes of the network',
              this.handlers,
              this.handlers.freeze,
              NodeFlags.FREEZE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'restart',
              'Restart all nodes of the network',
              this.handlers,
              this.handlers.restart,
              NodeFlags.RESTART_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand('keys', 'Generate node keys', this.handlers, this.handlers.keys, NodeFlags.KEYS_FLAGS),
          )
          .addSubcommand(
            new Subcommand(
              'refresh',
              'Reset and restart a node',
              this.handlers,
              this.handlers.refresh,
              NodeFlags.REFRESH_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'logs',
              'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
              this.handlers,
              this.handlers.logs,
              NodeFlags.LOGS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'states',
              'Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
              this.handlers,
              this.handlers.states,
              NodeFlags.STATES_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add',
              'Adds a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.add,
              NodeFlags.ADD_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-prepare',
              'Prepares the addition of a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.addPrepare,
              NodeFlags.ADD_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-submit-transactions',
              'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
              this.handlers,
              this.handlers.addSubmitTransactions,
              NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-execute',
              'Executes the addition of a previously prepared node',
              this.handlers,
              this.handlers.addExecute,
              NodeFlags.ADD_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update',
              'Update a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.update,
              NodeFlags.REFRESH_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-prepare',
              'Prepare the deployment to update a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.updatePrepare,
              NodeFlags.UPDATE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-submit-transactions',
              'Submit transactions for updating a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.updateSubmitTransactions,
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-execute',
              'Executes the updating of a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.updateExecute,
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete',
              'Delete a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.delete,
              NodeFlags.DELETE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-prepare',
              'Prepares the deletion of a node with a specific version of Hedera platform',
              this.handlers,
              this.handlers.deletePrepare,
              NodeFlags.DELETE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-submit-transactions',
              'Submits transactions to the network nodes for deleting a node',
              this.handlers,
              this.handlers.deleteSubmitTransactions,
              NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-execute',
              'Executes the deletion of a previously prepared node',
              this.handlers,
              this.handlers.deleteExecute,
              NodeFlags.DELETE_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'prepare-upgrade',
              'Prepare the network for a Freeze Upgrade operation',
              this.handlers,
              this.handlers.prepareUpgrade,
              NodeFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'freeze-upgrade',
              'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
              this.handlers,
              this.handlers.freezeUpgrade,
              NodeFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade',
              'upgrades all nodes on the network',
              this.handlers,
              this.handlers.upgrade,
              NodeFlags.UPGRADE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-prepare',
              'Prepare the deployment to upgrade network',
              this.handlers,
              this.handlers.upgradePrepare,
              NodeFlags.UPGRADE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-submit-transactions',
              'Submit transactions for upgrading network',
              this.handlers,
              this.handlers.upgradeSubmitTransactions,
              NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-execute',
              'Executes the upgrading the network',
              this.handlers,
              this.handlers.upgradeExecute,
              NodeFlags.UPGRADE_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'download-generated-files',
              'Downloads the generated files from an existing node',
              this.handlers,
              this.handlers.downloadGeneratedFiles,
              NodeFlags.DEFAULT_FLAGS,
            ),
          ),
      )
      .build();
  }
}
