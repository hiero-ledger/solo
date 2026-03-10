// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {ExplorerCommand} from '../explorer.js';
import * as constants from '../../core/constants.js';

@injectable()
export class ExplorerCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ExplorerCommand) public readonly explorerCommand?: ExplorerCommand,
  ) {
    super();
    this.explorerCommand = patchInject(explorerCommand, InjectTokens.ExplorerCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'explorer';
  protected static override readonly DESCRIPTION =
    'Explorer Node operations for creating, modifying, and destroying resources.' +
    'These commands require the presence of an existing deployment.';

  public static readonly NODE_SUBCOMMAND_NAME = 'node';
  private static readonly NODE_SUBCOMMAND_DESCRIPTION =
    'List, create, manage, or destroy explorer node instances. ' +
    'Operates on a single explorer node instance at a time.';

  public static readonly NODE_ADD = 'add';
  public static readonly NODE_DESTROY = 'destroy';
  public static readonly NODE_UPGRADE = 'upgrade';

  public static readonly ADD_COMMAND =
    `${ExplorerCommandDefinition.COMMAND_NAME} ${ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME} ${ExplorerCommandDefinition.NODE_ADD}` as const;

  public static readonly DESTROY_COMMAND =
    `${ExplorerCommandDefinition.COMMAND_NAME} ${ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME} ${ExplorerCommandDefinition.NODE_DESTROY}` as const;

  public static readonly UPGRADE_COMMAND =
    `${ExplorerCommandDefinition.COMMAND_NAME} ${ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME} ${ExplorerCommandDefinition.NODE_UPGRADE}` as const;

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
              ExplorerCommandDefinition.NODE_ADD,
              'Adds and configures a new node instance.',
              this.explorerCommand,
              this.explorerCommand.add,
              ExplorerCommand.DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ExplorerCommandDefinition.NODE_DESTROY,
              'Deletes the specified node from the deployment.',
              this.explorerCommand,
              this.explorerCommand.destroy,
              ExplorerCommand.DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          )
          .addSubcommand(
            new Subcommand(
              ExplorerCommandDefinition.NODE_UPGRADE,
              'Upgrades the specified node in the deployment.',
              this.explorerCommand,
              this.explorerCommand.upgrade,
              ExplorerCommand.UPGRADE_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .build();
  }
}
