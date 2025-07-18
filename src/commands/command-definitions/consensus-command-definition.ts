// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {NetworkCommand} from '../network.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as NodeFlags from '../node/flags.js';

export class ConsensusCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
    @inject(InjectTokens.NetworkCommand) public readonly networkCommand?: NetworkCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.networkCommand = patchInject(networkCommand, InjectTokens.NetworkCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'consensus';
  public static override readonly DESCRIPTION: string =
    'Consensus Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly NETWORK_SUBCOMMAND_NAME: string = 'network';
  public static readonly NETWORK_SUBCOMMAND_DESCRIPTION: string =
    'Ledger/network wide consensus operations such as freeze, upgrade, ' +
    'and deploy. Operates on the entire ledger and all consensus node instances.';

  public static readonly NODE_SUBCOMMAND_NAME: string = 'node';
  public static readonly NODE_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, or destroy consensus node instances. Operates on a single consensus node instance at a time.';

  public static readonly STATE_SUBCOMMAND_NAME: string = 'state';
  public static readonly STATE_SUBCOMMAND_DESCRIPTION: string =
    'List, download, and upload consensus node state backups to/from individual consensus node instances.';

  public static readonly DIAGNOSTIC_SUBCOMMAND_NAME: string = 'diagnostic';
  public static readonly DIAGNOSTIC_SUBCOMMAND_DESCRIPTION: string =
    'Capture diagnostic information such as logs, signed states, and ledger/network/node configurations.';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.NETWORK_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              'deploy',
              'Installs and configures all consensus nodes for the deployment.',
              this.networkCommand,
              this.networkCommand.deploy,
              NetworkCommand.DEPLOY_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'destroy',
              'Removes all consensus network components from the deployment.',
              this.networkCommand,
              this.networkCommand.destroy,
              NetworkCommand.DESTROY_FLAGS_LIST,
            ),
          )
          // TODO: Moved from consensus node
          .addSubcommand(
            new Subcommand(
              'upgrade',
              'upgrades all nodes on the network',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.upgrade,
              NodeFlags.UPGRADE_FLAGS,
            ),
          )
          // TODO: Moved from consensus node
          .addSubcommand(
            new Subcommand(
              'freeze',
              'Initiates a network freeze for scheduled maintenance or upgrades.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.freeze,
              NodeFlags.FREEZE_FLAGS,
            ),
          )
          // TODO: MOVED
          .addSubcommand(
            new Subcommand(
              'prepare-upgrade',
              'Prepare the network for a Freeze Upgrade operation',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.prepareUpgrade,
              NodeFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'freeze-upgrade',
              'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.freezeUpgrade,
              NodeFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-prepare',
              'Prepare the deployment to upgrade network',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.upgradePrepare,
              NodeFlags.UPGRADE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-submit-transactions',
              'Submit transactions for upgrading network',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.upgradeSubmitTransactions,
              NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade-execute',
              'Executes the upgrading the network',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.upgradeExecute,
              NodeFlags.UPGRADE_EXECUTE_FLAGS,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.NODE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              'setup',
              'Setup node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.setup,
              NodeFlags.SETUP_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'start',
              'Start a node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.start,
              NodeFlags.START_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'stop',
              'Stop a node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.stop,
              NodeFlags.STOP_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'restart',
              'Restart all nodes of the network',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.restart,
              NodeFlags.RESTART_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'keys',
              'Generate node keys',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.keys,
              NodeFlags.KEYS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'refresh',
              'Reset and restart a node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.refresh,
              NodeFlags.REFRESH_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'logs',
              'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.logs,
              NodeFlags.LOGS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'states',
              'Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.states,
              NodeFlags.STATES_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add',
              'Adds a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.add,
              NodeFlags.ADD_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-prepare',
              'Prepares the addition of a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.addPrepare,
              NodeFlags.ADD_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-submit-transactions',
              'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.addSubmitTransactions,
              NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'add-execute',
              'Executes the addition of a previously prepared node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.addExecute,
              NodeFlags.ADD_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update',
              'Update a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.update,
              NodeFlags.REFRESH_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-prepare',
              'Prepare the deployment to update a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.updatePrepare,
              NodeFlags.UPDATE_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-submit-transactions',
              'Submit transactions for updating a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.updateSubmitTransactions,
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update-execute',
              'Executes the updating of a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.updateExecute,
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete',
              'Delete a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              // @ts-expect-error not all contexts have field
              this.nodeCommand.handlers.delete,
              NodeFlags.DESTROY_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-prepare',
              'Prepares the deletion of a node with a specific version of Hedera platform',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.destroyPrepare,
              NodeFlags.DESTROY_PREPARE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-submit-transactions',
              'Submits transactions to the network nodes for deleting a node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.destroySubmitTransactions,
              NodeFlags.DESTROY_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'delete-execute',
              'Executes the deletion of a previously prepared node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.destroyExecute,
              NodeFlags.DESTROY_EXECUTE_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'download-generated-files',
              'Downloads the generated files from an existing node',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.downloadGeneratedFiles,
              NodeFlags.DEFAULT_FLAGS,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.STATE_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            'download',
            'Downloads a signed state from a consensus node.',
            this.nodeCommand.handlers,
            this.nodeCommand.handlers.downloadGeneratedFiles,
            NodeFlags.DEFAULT_FLAGS,
          ),
        ),
      )
      .build();
  }
}
