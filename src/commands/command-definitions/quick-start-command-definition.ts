// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {DefaultQuickStartCommand} from '../quick-start/default-quick-start.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class QuickStartCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.QuickStartCommand) public readonly quickStartCommand?: DefaultQuickStartCommand,
  ) {
    super();
    this.quickStartCommand = patchInject(quickStartCommand, InjectTokens.QuickStartCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'quick-start';
  protected static override readonly DESCRIPTION =
    'Quick start commands for new and returning users who need a preset environment type. ' +
    'These commands use reasonable defaults to provide a single command out of box experience.';

  public static readonly SINGLE_SUBCOMMAND_NAME = 'single';
  private static readonly SINGLE_SUBCOMMAND_DESCRIPTION =
    'Creates a uniquely named deployment with a single consensus node, ' +
    'mirror node, block node, relay node, and explorer node.';

  public static readonly MULTI_SUBCOMMAND_NAME = 'multi';
  private static readonly MULTI_SUBCOMMAND_DESCRIPTION =
    'Creates a uniquely named deployment with a four consensus nodes, ' +
    'a single mirror node, a single block node, a single relay node, and a single explorer node.';

  public static readonly SINGLE_DEPLOY = 'deploy';
  public static readonly SINGLE_DESTROY = 'destroy';

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
        )
          .addSubcommand(
            new Subcommand(
              QuickStartCommandDefinition.SINGLE_DEPLOY,
              'Deploys all required components for the selected quick start configuration.',
              this.quickStartCommand,
              this.quickStartCommand.deploy,
              DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              QuickStartCommandDefinition.SINGLE_DESTROY,
              'Removes the deployed resources for the selected quick start configuration.',
              this.quickStartCommand,
              this.quickStartCommand.destroy,
              DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
