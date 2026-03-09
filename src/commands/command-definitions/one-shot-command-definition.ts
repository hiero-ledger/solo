// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {DefaultOneShotCommand} from '../one-shot/default-one-shot.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';

@injectable()
export class OneShotCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.OneShotCommand) public readonly oneShotCommand?: DefaultOneShotCommand,
  ) {
    super();
    this.oneShotCommand = patchInject(oneShotCommand, InjectTokens.OneShotCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'one-shot';
  protected static override readonly DESCRIPTION: string =
    'One Shot commands for new and returning users who need a preset environment type. ' +
    'These commands use reasonable defaults to provide a single command out of box experience.';

  public static readonly SINGLE_SUBCOMMAND_NAME: string = 'single';
  private static readonly SINGLE_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with a single consensus node, ' +
    'mirror node, block node, relay node, and explorer node.';

  public static readonly MULTI_SUBCOMMAND_NAME: string = 'multi';
  private static readonly MULTI_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with multiple consensus nodes, ' +
    'mirror node, block node, relay node, and explorer node.';

  public static readonly FALCON_SUBCOMMAND_NAME: string = 'falcon';
  private static readonly FALCON_SUBCOMMAND_DESCRIPTION: string =
    'Creates a uniquely named deployment with optional chart values override using --values-file.';

  public static readonly SINGLE_DEPLOY: string = 'deploy';
  public static readonly SINGLE_DESTROY: string = 'destroy';
  public static readonly INFO_COMMAND_NAME: string = 'show';
  public static readonly MULTIPLE_DEPLOY: string = 'deploy';
  public static readonly MULTIPLE_DESTROY: string = 'destroy';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(OneShotCommandDefinition.COMMAND_NAME, OneShotCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
          OneShotCommandDefinition.SINGLE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DEPLOY,
              'Deploys all required components for the selected one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.deploy,
              DefaultOneShotCommand.DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
              true,
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DESTROY,
              'Removes the deployed resources for the selected one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.destroy,
              DefaultOneShotCommand.DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.MULTI_SUBCOMMAND_NAME,
          OneShotCommandDefinition.MULTI_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.MULTIPLE_DEPLOY,
              'Deploys all required components for the selected multiple node one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.deploy,
              DefaultOneShotCommand.DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
              true,
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.MULTIPLE_DESTROY,
              'Removes the deployed resources for the selected multiple node one shot configuration.',
              this.oneShotCommand,
              this.oneShotCommand.destroy,
              DefaultOneShotCommand.DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.FALCON_SUBCOMMAND_NAME,
          OneShotCommandDefinition.FALCON_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DEPLOY,
              'Deploys all required components for the selected one shot configuration (with optional values file).',
              this.oneShotCommand,
              this.oneShotCommand.deployFalcon,
              DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
              true,
            ),
          )
          .addSubcommand(
            new Subcommand(
              OneShotCommandDefinition.SINGLE_DESTROY,
              'Removes the deployed resources for the selected one shot configuration (with optional values file).',
              this.oneShotCommand,
              this.oneShotCommand.destroyFalcon,
              DefaultOneShotCommand.FALCON_DESTROY_FLAGS_LIST,
              [...constants.BASE_DEPENDENCIES],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          OneShotCommandDefinition.INFO_COMMAND_NAME,
          'Display information about one-shot deployments.',
        ).addSubcommand(
          new Subcommand(
            'deployment',
            'Display information about the last one-shot deployment including name, versions, and deployed components.',
            this.oneShotCommand,
            this.oneShotCommand.info,
            DefaultOneShotCommand.INFO_FLAGS_LIST,
          ),
        ),
      )
      .build();
  }
}
