// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {RapidFireCommand} from '../rapid-fire.js';

@injectable()
export class RapidFireCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.RapidFireCommand) public readonly rapidFireCommand?: RapidFireCommand,
  ) {
    super();
    this.rapidFireCommand = patchInject(rapidFireCommand, InjectTokens.RapidFireCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  // com.hedera.benchmark.CryptoTransferLoadTest
  // com.hedera.benchmark.HCSLoadTest
  // com.hedera.benchmark.NftTransferLoadTest
  // com.hedera.benchmark.TokenTransferLoadTest

  public static override readonly COMMAND_NAME = 'rapid-fire';

  public static readonly CRYPTO_TRANSFER_SUBCOMMAND_NAME = 'crypto-transfer';

  public static readonly START = 'start';
  public static readonly STOP = 'stop';

  public static readonly RAPID_FIRE_CRYPTO_TRANSFER_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.CRYPTO_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;

  public static readonly RAPID_FIRE_CRYPTO_TRANSFER_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.CRYPTO_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(RapidFireCommandDefinition.COMMAND_NAME, 'TODO', this.logger)
      .addCommandGroup(
        new CommandGroup(RapidFireCommandDefinition.CRYPTO_TRANSFER_SUBCOMMAND_NAME, 'TODO')
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'TODO',
              this.rapidFireCommand,
              this.rapidFireCommand.cryptoTransferStart,
              RapidFireCommand.CRYPTO_TRANSFER_START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'TODO',
              this.rapidFireCommand,
              this.rapidFireCommand.stop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .build();
  }
}
