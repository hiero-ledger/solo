// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {AccountCommand} from '../account.js';
import {FileCommand} from '../file.js';

@injectable()
export class LedgerCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.AccountCommand) public readonly accountCommand?: AccountCommand,
    @inject(InjectTokens.FileCommand) public readonly fileCommand?: FileCommand,
  ) {
    super();
    this.accountCommand = patchInject(accountCommand, InjectTokens.AccountCommand, this.constructor.name);
    this.fileCommand = patchInject(fileCommand, InjectTokens.FileCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'ledger';
  protected static override readonly DESCRIPTION =
    'System, Account, and Crypto ledger-based management operations. ' +
    'These commands require an operational set of consensus nodes and may require an operational mirror node.';

  public static readonly SYSTEM_SUBCOMMAND_NAME = 'system';
  private static readonly SYSTEM_SUBCOMMAND_DESCRIPTION =
    'Perform a full ledger initialization on a new deployment, ' +
    'rekey privileged/system accounts, or setup network staking parameters.';

  public static readonly ACCOUNT_SUBCOMMAND_NAME = 'account';
  private static readonly ACCOUNT_SUBCOMMAND_DESCRIPTION =
    'View, list, create, update, delete, and import ledger accounts.';

  public static readonly CRYPTO_SUBCOMMAND_NAME = 'crypto';
  private static readonly CRYPTO_SUBCOMMAND_DESCRIPTION =
    'Transfer native crypto tokens or query native token account balances.';

  public static readonly FILE_SUBCOMMAND_NAME = 'file';
  private static readonly FILE_SUBCOMMAND_DESCRIPTION = 'Upload or update files on the Hiero network.';

  public static readonly SYSTEM_INIT = 'init';
  public static readonly ACCOUNT_UPDATE = 'update';
  public static readonly ACCOUNT_CREATE = 'create';
  public static readonly ACCOUNT_INFO = 'info';
  public static readonly FILE_CREATE = 'create';
  public static readonly FILE_UPDATE = 'update';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(LedgerCommandDefinition.COMMAND_NAME, LedgerCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
          LedgerCommandDefinition.SYSTEM_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            LedgerCommandDefinition.SYSTEM_INIT,
            'Re-keys ledger system accounts and consensus node admin keys with uniquely generated ED25519 private keys and will stake consensus nodes.',
            this.accountCommand,
            this.accountCommand.init,
            AccountCommand.INIT_FLAGS_LIST,
            [],
          ),
        ),
      )
      .addCommandGroup(
        new CommandGroup(
          LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
          LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              LedgerCommandDefinition.ACCOUNT_UPDATE,
              'Updates an existing ledger account.',
              this.accountCommand,
              this.accountCommand.update,
              AccountCommand.UPDATE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              LedgerCommandDefinition.ACCOUNT_CREATE,
              'Creates a new ledger account.',
              this.accountCommand,
              this.accountCommand.create,
              AccountCommand.CREATE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              LedgerCommandDefinition.ACCOUNT_INFO,
              'Gets the account info including the current amount of HBAR',
              this.accountCommand,
              this.accountCommand.get,
              AccountCommand.GET_FLAGS_LIST,
              [],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          LedgerCommandDefinition.FILE_SUBCOMMAND_NAME,
          LedgerCommandDefinition.FILE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              LedgerCommandDefinition.FILE_CREATE,
              'Create a new file on the Hiero network',
              this.fileCommand,
              this.fileCommand.create,
              FileCommand.CREATE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              LedgerCommandDefinition.FILE_UPDATE,
              'Update an existing file on the Hiero network',
              this.fileCommand,
              this.fileCommand.update,
              FileCommand.UPDATE_FLAGS_LIST,
              [],
            ),
          ),
      )
      .build();
  }
}
