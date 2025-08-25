// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {NetworkCommand} from '../network.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as NodeFlags from '../node/flags.js';

@injectable()
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

  public static override readonly COMMAND_NAME = 'consensus';
  protected static override readonly DESCRIPTION =
    'Consensus Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly NETWORK_SUBCOMMAND_NAME = 'network';
  private static readonly NETWORK_SUBCOMMAND_DESCRIPTION =
    'Ledger/network wide consensus operations such as freeze, upgrade, ' +
    'and deploy. Operates on the entire ledger and all consensus node instances.';

  public static readonly NODE_SUBCOMMAND_NAME = 'node';
  private static readonly NODE_SUBCOMMAND_DESCRIPTION =
    'List, create, manage, or destroy consensus node instances. Operates on a single consensus node instance at a time.';

  public static readonly STATE_SUBCOMMAND_NAME = 'state';
  private static readonly STATE_SUBCOMMAND_DESCRIPTION =
    'List, download, and upload consensus node state backups to/from individual consensus node instances.';

  public static readonly DIAGNOSTIC_SUBCOMMAND_NAME = 'diagnostic';
  private static readonly DIAGNOSTIC_SUBCOMMAND_DESCRIPTION =
    'Capture diagnostic information such as logs, signed states, and ledger/network/node configurations.';

  public static readonly DEV_NODE_ADD_SUBCOMMAND_NAME = 'dev-node-add';
  private static readonly DEV_NODE_ADD_SUBCOMMAND_DESCRIPTION = 'Dev operations for adding consensus nodes.';

  public static readonly DEV_NODE_UPDATE_SUBCOMMAND_NAME = 'dev-node-update';
  private static readonly DEV_NODE_UPDATE_SUBCOMMAND_DESCRIPTION = 'Dev operations for updating consensus nodes';

  public static readonly DEV_NODE_UPGRADE_SUBCOMMAND_NAME = 'dev-node-upgrade';
  private static readonly DEV_NODE_UPGRADE_SUBCOMMAND_DESCRIPTION = 'Dev operations for upgrading consensus nodes';

  public static readonly DEV_NODE_DELETE_SUBCOMMAND_NAME = 'dev-node-delete';
  private static readonly DEV_NODE_DELETE_SUBCOMMAND_DESCRIPTION = 'Dev operations for delete consensus nodes';

  public static readonly DEV_FREEZE_SUBCOMMAND_NAME = 'dev-freeze';
  private static readonly DEV_FREEZE_SUBCOMMAND_DESCRIPTION = 'Dev operations for freezing consensus nodes';

  public static readonly DEV_NODE_PREPARE = 'prepare';
  public static readonly DEV_NODE_SUBMIT_TRANSACTION = 'submit-transactions';
  public static readonly DEV_NODE_EXECUTE = 'execute';

  public static readonly DEV_FREEZE_PREPARE_UPGRADE = 'prepare-upgrade';
  public static readonly DEV_FREEZE_FREEZE_UPGRADE = 'freeze-upgrade';

  public static readonly NODE_SETUP = 'setup';
  public static readonly NODE_START = 'start';
  public static readonly NODE_STOP = 'stop';
  public static readonly NODE_RESTART = 'restart';
  public static readonly NODE_REFRESH = 'refresh';
  public static readonly NODE_LOGS = 'logs';
  public static readonly NODE_STATES = 'states';
  public static readonly NODE_ADD = 'add';
  public static readonly NODE_UPDATE = 'update';
  public static readonly NODE_DESTROY = 'destroy';

  public static readonly NETWORK_DEPLOY = 'deploy';
  public static readonly NETWORK_DESTROY = 'destroy';
  public static readonly NETWORK_UPGRADE = 'upgrade';
  public static readonly NETWORK_FREEZE = 'freeze';

  public static readonly DIAGNOSTIC_CONFIGS = 'config';
  public static readonly DIAGNOSTIC_ALL = 'all';

  public static readonly STATE_DOWNLOAD = 'download';

  public static readonly SETUP_COMMAND =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_SETUP}` as const;
  public static readonly START_COMMAND =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NODE_START}` as const;

  public static readonly DEPLOY_COMMAND =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_DEPLOY}` as const;

  public static readonly DESTROY_COMMAND =
    `${ConsensusCommandDefinition.COMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME} ${ConsensusCommandDefinition.NETWORK_DESTROY}` as const;

  public getCommandDefinition(): CommandDefinition {
    return (
      new CommandBuilder(ConsensusCommandDefinition.COMMAND_NAME, ConsensusCommandDefinition.DESCRIPTION, this.logger)
        // NETWORK SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_DEPLOY,
                'Installs and configures all consensus nodes for the deployment.',
                this.networkCommand,
                this.networkCommand.deploy,
                NetworkCommand.DEPLOY_FLAGS_LIST,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_DESTROY,
                'Removes all consensus network components from the deployment.',
                this.networkCommand,
                this.networkCommand.destroy,
                NetworkCommand.DESTROY_FLAGS_LIST,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_FREEZE,
                'Initiates a network freeze for scheduled maintenance or upgrades',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.freeze,
                NodeFlags.FREEZE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NETWORK_UPGRADE,
                'Upgrades the software version running on all consensus nodes.',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgrade,
                NodeFlags.UPGRADE_FLAGS,
              ),
            ),
        )
        // NODE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NODE_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_SETUP,
                'Setup node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.setup,
                NodeFlags.SETUP_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_START,
                'Start a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.start,
                NodeFlags.START_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_STOP,
                'Stop a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.stop,
                NodeFlags.STOP_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_RESTART,
                'Restart all nodes of the network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.restart,
                NodeFlags.RESTART_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_REFRESH,
                'Reset and restart a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.refresh,
                NodeFlags.REFRESH_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_ADD,
                'Adds a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.add,
                NodeFlags.ADD_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_UPDATE,
                'Update a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.update,
                NodeFlags.REFRESH_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.NODE_DESTROY,
                'Delete a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroy,
                NodeFlags.DESTROY_FLAGS,
              ),
            ),
        )
        // STATE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.STATE_SUBCOMMAND_DESCRIPTION,
          ).addSubcommand(
            new Subcommand(
              ConsensusCommandDefinition.STATE_DOWNLOAD,
              'Downloads a signed state from consensus node/nodes.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.states,
              NodeFlags.STATES_FLAGS,
            ),
          ),
        )
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DIAGNOSTIC_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DIAGNOSTIC_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DIAGNOSTIC_CONFIGS,
                'Collects configuration files from consensus nodes.',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.downloadGeneratedFiles,
                NodeFlags.DEFAULT_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DIAGNOSTIC_ALL,
                'Captures logs, configs, and diagnostic artifacts from all consensus nodes.',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.logs,
                NodeFlags.LOGS_FLAGS,
              ),
            ),
        )
        // DEV NODE ADD SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepares the addition of a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.addPrepare,
                NodeFlags.ADD_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.addSubmitTransactions,
                NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the addition of a previously prepared node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.addExecute,
                NodeFlags.ADD_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV NODE UPDATE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepare the deployment to update a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.updatePrepare,
                NodeFlags.UPDATE_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submit transactions for updating a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.updateSubmitTransactions,
                NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the updating of a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.updateExecute,
                NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            ),
        )
        // DEV NODE UPGRADE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepare for upgrading network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgradePrepare,
                NodeFlags.DEFAULT_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submit transactions for upgrading network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgradeSubmitTransactions,
                NodeFlags.UPGRADE_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the upgrading the network',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.upgradeExecute,
                NodeFlags.UPGRADE_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV NODE DELETE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_PREPARE,
                'Prepares the deletion of a node with a specific version of Hedera platform',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroyPrepare,
                NodeFlags.DESTROY_PREPARE_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
                'Submits transactions to the network nodes for deleting a node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroySubmitTransactions,
                NodeFlags.DESTROY_SUBMIT_TRANSACTIONS_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_NODE_EXECUTE,
                'Executes the deletion of a previously prepared node',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.destroyExecute,
                NodeFlags.DESTROY_EXECUTE_FLAGS,
              ),
            ),
        )
        // DEV FREEZE SUBCOMMANDS
        .addCommandGroup(
          new CommandGroup(
            ConsensusCommandDefinition.DEV_FREEZE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.DEV_FREEZE_SUBCOMMAND_DESCRIPTION,
          )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_FREEZE_PREPARE_UPGRADE,
                'Prepare the network for a Freeze Upgrade operation',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.prepareUpgrade,
                NodeFlags.DEFAULT_FLAGS,
              ),
            )
            .addSubcommand(
              new Subcommand(
                ConsensusCommandDefinition.DEV_FREEZE_FREEZE_UPGRADE,
                'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
                this.nodeCommand.handlers,
                this.nodeCommand.handlers.freezeUpgrade,
                NodeFlags.DEFAULT_FLAGS,
              ),
            ),
        )
        .build()
    );
  }
}
