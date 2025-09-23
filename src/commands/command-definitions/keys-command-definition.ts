// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as NodeFlags from '../node/flags.js';

@injectable()
export class KeysCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'keys';
  protected static override readonly DESCRIPTION = 'Consensus key generation operations';

  public static readonly CONSENSUS_SUBCOMMAND_NAME = 'consensus';
  private static readonly CONSENSUS_SUBCOMMAND_DESCRIPTION =
    'Generate unique cryptographic keys (gossip or grpc TLS keys) for the Consensus Node instances.';

  public static readonly CONSENSUS_GENERATE = 'generate';

  public static readonly KEYS_COMMAND =
    `${KeysCommandDefinition.COMMAND_NAME} ${KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME} ${KeysCommandDefinition.CONSENSUS_GENERATE}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(KeysCommandDefinition.COMMAND_NAME, KeysCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
          KeysCommandDefinition.CONSENSUS_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            KeysCommandDefinition.CONSENSUS_GENERATE,
            'Generates TLS keys required for consensus node communication.',
            this.nodeCommand.handlers,
            this.nodeCommand.handlers.keys,
            NodeFlags.KEYS_FLAGS,
            [],
            false,
          ),
        ),
      )
      .build();
  }
}
