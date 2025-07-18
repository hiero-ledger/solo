// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

export class KeysCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'deployment';
  public static override readonly DESCRIPTION: string = 'TODO'; // TODO

  public static readonly CONSENSUS_SUBCOMMAND_NAME: string = 'consensus';
  public static readonly CONSENSUS_SUBCOMMAND_DESCRIPTION: string =
    'Generate unique cryptographic keys (gossip or grpc TLS keys) for the Consensus Node instances.';

  public getCommandDefinition(): CommandDefinition {
    /// Generates TLS keys required for consensus node communication.
    return new CommandBuilder(KeysCommandDefinition.COMMAND_NAME, KeysCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
          KeysCommandDefinition.CONSENSUS_SUBCOMMAND_DESCRIPTION,
        ),
      )
      .build();
  }
}
