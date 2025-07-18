// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

export class MirrorCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'mirror';
  public static override readonly DESCRIPTION: string =
    'Mirror Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly CONSENSUS_SUBCOMMAND_NAME: string = 'node';
  public static readonly CONSENSUS_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, or destroy mirror node instances. Operates on a single mirror node instance at a time.';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(MirrorCommandDefinition.COMMAND_NAME, MirrorCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          MirrorCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
          MirrorCommandDefinition.CONSENSUS_SUBCOMMAND_DESCRIPTION,
        ),
      )
      .build();
  }
}
