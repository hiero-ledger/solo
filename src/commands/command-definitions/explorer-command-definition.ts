// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {ExplorerCommand} from '../explorer.js';

export class ExplorerCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ExplorerCommand) public readonly explorerCommand?: ExplorerCommand,
  ) {
    super();
    this.explorerCommand = patchInject(explorerCommand, InjectTokens.ExplorerCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'explorer';
  public static override readonly DESCRIPTION: string =
    'Explorer Node operations for creating, modifying, and destroying resources.' +
    'These commands require the presence of an existing deployment.';

  public static readonly NODE_SUBCOMMAND_NAME: string = 'node';
  public static readonly NODE_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, or destroy explorer node instances. ' +
    'Operates on a single explorer node instance at a time.';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      ExplorerCommandDefinition.COMMAND_NAME,
      ExplorerCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME,
          ExplorerCommandDefinition.NODE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              'add',
              'Adds and configures a new node instance.',
              this.explorerCommand,
              this.explorerCommand.add,
              ExplorerCommand.DEPLOY_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'destroy',
              'Deletes the specified node from the deployment.',
              this.explorerCommand,
              this.explorerCommand.destroy,
              ExplorerCommand.DESTROY_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
