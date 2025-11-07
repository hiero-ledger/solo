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

  public static override readonly COMMAND_NAME = 'rapid-fire';

  public static readonly LOAD_SUBCOMMAND_NAME = 'load';
  public static readonly DESTROY_SUBCOMMAND_NAME = 'destroy';

  public static readonly START = 'start';
  public static readonly STOP = 'stop';
  public static readonly ALL = 'all';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      RapidFireCommandDefinition.COMMAND_NAME,
      'Commands for performing load tests a Solo deployment',
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.LOAD_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the selected class.',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire load test using the selected class.',
              this.rapidFireCommand,
              this.rapidFireCommand.start,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the selected class.',
              this.rapidFireCommand,
              this.rapidFireCommand.stop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.DESTROY_SUBCOMMAND_NAME,
          'Uninstall the Network Load Generator Helm chart and clean up resources.',
        ).addSubcommand(
          new Subcommand(
            RapidFireCommandDefinition.ALL,
            'Uninstall the Network Load Generator Helm chart and remove all related resources.',
            this.rapidFireCommand,
            this.rapidFireCommand.destroy,
            RapidFireCommand.DESTROY_FLAGS_LIST,
            [constants.HELM, constants.KUBECTL],
            false,
          ),
        ),
      )
      .build();
  }
}
