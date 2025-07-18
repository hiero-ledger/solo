// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

export class QuickStartCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'deployment';
  public static override readonly DESCRIPTION: string =
    'Quick start commands for new and returning users who need a preset environment type. ' +
    'These commands use reasonable defaults to provide a single command out of box experience.';

  public static readonly SINGLE_SUBCOMMAND_NAME: string = 'single';
  public static readonly SINGLE_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with a single consensus node, ' +
    'mirror node, block node, relay node, and explorer node.';

  public static readonly MULTI_SUBCOMMAND_NAME: string = 'multi';
  public static readonly MULTI_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with a four consensus nodes, ' +
    'a single mirror node, a single block node, a single relay node, and a single explorer node.';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      QuickStartCommandDefinition.COMMAND_NAME,
      QuickStartCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          QuickStartCommandDefinition.SINGLE_SUBCOMMAND_NAME,
          QuickStartCommandDefinition.SINGLE_SUBCOMMAND_DESCRIPTION,
        ),
      )
      .addCommandGroup(
        new CommandGroup(
          QuickStartCommandDefinition.MULTI_SUBCOMMAND_NAME,
          QuickStartCommandDefinition.MULTI_SUBCOMMAND_DESCRIPTION,
        ),
      )
      .build();
  }
}
