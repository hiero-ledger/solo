// SPDX-License-Identifier: Apache-2.0

import {CommandBuilder, CommandGroup, Subcommand} from '../core/command-path-builders/command-builder.js';
import {inject} from 'tsyringe-neo';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {NetworkCommand} from './network.js';
import {NodeCommand} from './node/index.js';
import * as NodeFlags from './node/flags.js';
import {type SoloLogger} from '../core/logging/solo-logger.js';
import {type CommandDefinition} from '../types/index.js';

export class CommandDefinitionBuilder {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public getConsensusCommandDefinition(networkCommand: NetworkCommand, nodeCommand: NodeCommand): CommandDefinition {
    return new CommandBuilder('consensus', 'Consensus related commands', this.logger)
      .addCommandGroup(
        new CommandGroup(NetworkCommand.SUBCOMMAND_NAME, 'Manage solo network deployment')
          .addSubcommand(
            new Subcommand(
              'deploy',
              'Deploy solo network. ' +
                'Requires the chart `solo-cluster-setup` to have been installed in the cluster. `' +
                "If it hasn't the following command can be ran: `solo cluster-ref config setup`",
              networkCommand,
              networkCommand.deploy,
              NetworkCommand.DEPLOY_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'destroy',
              'Destroy solo network. If both --delete-pvcs and --delete-secrets are set to true, ' +
                'the namespace will be deleted.',
              networkCommand,
              networkCommand.destroy,
              NetworkCommand.DESTROY_FLAGS_LIST,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(NodeCommand.SUBCOMMAND_NAME, 'Manage Hedera platform node in solo network')
          .addSubcommand(
            new Subcommand(
              'setup',
              'Setup node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.setup,
              NodeFlags.SETUP_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'start',
              'Start a node',
              nodeCommand.handlers,
              nodeCommand.handlers.start,
              NodeFlags.START_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'stop',
              'Stop a node',
              nodeCommand.handlers,
              nodeCommand.handlers.stop,
              NodeFlags.STOP_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'freeze',
              'Freeze all nodes of the network',
              nodeCommand.handlers,
              nodeCommand.handlers.freeze,
              NodeFlags.FREEZE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'restart',
              'Restart all nodes of the network',
              nodeCommand.handlers,
              nodeCommand.handlers.restart,
              NodeFlags.RESTART_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'keys',
              'Generate node keys',
              nodeCommand.handlers,
              nodeCommand.handlers.keys,
              NodeFlags.KEYS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'refresh',
              'Reset and restart a node',
              nodeCommand.handlers,
              nodeCommand.handlers.refresh,
              NodeFlags.REFRESH_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'logs',
              'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
              nodeCommand.handlers,
              nodeCommand.handlers.logs,
              NodeFlags.LOGS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'states',
              'Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
              nodeCommand.handlers,
              nodeCommand.handlers.states,
              NodeFlags.STATES_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add',
              'Adds a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.add,
              NodeFlags.ADD_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-prepare',
              'Prepares the addition of a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.addPrepare,
              NodeFlags.ADD_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-submit-transactions',
              'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
              nodeCommand.handlers,
              nodeCommand.handlers.addSubmitTransactions,
              NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-execute',
              'Executes the addition of a previously prepared node',
              nodeCommand.handlers,
              nodeCommand.handlers.addExecute,
              NodeFlags.ADD_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update',
              'Update a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.update,
              NodeFlags.REFRESH_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-prepare',
              'Prepare the deployment to update a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.updatePrepare,
              NodeFlags.UPDATE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-submit-transactions',
              'Submit transactions for updating a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.updateSubmitTransactions,
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-execute',
              'Executes the updating of a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.updateExecute,
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete',
              'Delete a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.delete,
              NodeFlags.DELETE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-prepare',
              'Prepares the deletion of a node with a specific version of Hedera platform',
              nodeCommand.handlers,
              nodeCommand.handlers.deletePrepare,
              NodeFlags.DELETE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-submit-transactions',
              'Submits transactions to the network nodes for deleting a node',
              nodeCommand.handlers,
              nodeCommand.handlers.deleteSubmitTransactions,
              NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-execute',
              'Executes the deletion of a previously prepared node',
              nodeCommand.handlers,
              nodeCommand.handlers.deleteExecute,
              NodeFlags.DELETE_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'prepare-upgrade',
              'Prepare the network for a Freeze Upgrade operation',
              nodeCommand.handlers,
              nodeCommand.handlers.prepareUpgrade,
              NodeFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'freeze-upgrade',
              'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
              nodeCommand.handlers,
              nodeCommand.handlers.freezeUpgrade,
              NodeFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade',
              'upgrades all nodes on the network',
              nodeCommand.handlers,
              nodeCommand.handlers.upgrade,
              NodeFlags.UPGRADE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-prepare',
              'Prepare the deployment to upgrade network',
              nodeCommand.handlers,
              nodeCommand.handlers.upgradePrepare,
              NodeFlags.UPGRADE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-submit-transactions',
              'Submit transactions for upgrading network',
              nodeCommand.handlers,
              nodeCommand.handlers.upgradeSubmitTransactions,
              NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-execute',
              'Executes the upgrading the network',
              nodeCommand.handlers,
              nodeCommand.handlers.upgradeExecute,
              NodeFlags.UPGRADE_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'download-generated-files',
              'Downloads the generated files from an existing node',
              nodeCommand.handlers,
              nodeCommand.handlers.downloadGeneratedFiles,
              NodeFlags.DEFAULT_FLAGS,
            ),
          ),
      )
      .build();
  }
}
