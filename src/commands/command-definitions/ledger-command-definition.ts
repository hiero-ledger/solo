// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {AccountCommand} from '../account.js';

export class LedgerCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.AccountCommand) public readonly accountCommand?: AccountCommand,
  ) {
    super();
    this.accountCommand = patchInject(accountCommand, InjectTokens.AccountCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'ledger';
  public static override readonly DESCRIPTION: string =
    'System, Account, and Crypto ledger-based management operations. ' +
    'These commands require an operational set of consensus nodes and may require an operational mirror node.';

  public static readonly SYSTEM_SUBCOMMAND_NAME: string = 'system';
  public static readonly SYSTEM_SUBCOMMAND_DESCRIPTION: string =
    'Perform a full ledger initialization on a new deployment, ' +
    'rekey privileged/system accounts, or setup network staking parameters.';

  public static readonly ACCOUNT_SUBCOMMAND_NAME: string = 'account';
  public static readonly ACCOUNT_SUBCOMMAND_DESCRIPTION: string =
    'View, list, create, update, delete, and import ledger accounts.';

  public static readonly CRYPTO_SUBCOMMAND_NAME: string = 'crypto';
  public static readonly CRYPTO_SUBCOMMAND_DESCRIPTION: string =
    'Transfer native crypto tokens or query native token account balances.';

  public getCommandDefinition(): CommandDefinition {
    /// Generates TLS keys required for consensus node communication.
    return new CommandBuilder(LedgerCommandDefinition.COMMAND_NAME, LedgerCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
          LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              'init',
              'Lists all ledger accounts.',
              this,
              this.accountCommand.init,
              AccountCommand.INIT_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'update',
              'Updates an existing ledger account.',
              this,
              this.accountCommand.update,
              AccountCommand.UPDATE_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'create',
              'Creates a new ledger account.',
              this,
              this.accountCommand.create,
              AccountCommand.CREATE_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'get',
              'Gets the account info including the current amount of HBAR',
              this,
              this.accountCommand.get,
              AccountCommand.GET_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
