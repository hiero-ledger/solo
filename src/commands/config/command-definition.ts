// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from '../command-definitions/base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {ConfigCommand} from './config.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {Flags as flags} from '../flags.js';

@injectable()
export class ConfigCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigCommand) public readonly configCommand?: ConfigCommand,
  ) {
    super();
    this.configCommand = patchInject(configCommand, InjectTokens.ConfigCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'config';
  protected static override readonly DESCRIPTION = 'Configuration operations for non-consensus nodes';

  public static readonly SUBCOMMAND_NAME = 'ops';
  private static readonly SUBCOMMAND_DESCRIPTION = 'Operational tasks for non-consensus nodes';

  public static readonly LOGS_COMMAND = 'logs';

  public static readonly LOGS_FLAGS_LIST = {
    required: [],
    optional: [flags.outputDir],
  };

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(ConfigCommandDefinition.COMMAND_NAME, ConfigCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          ConfigCommandDefinition.SUBCOMMAND_NAME,
          ConfigCommandDefinition.SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            ConfigCommandDefinition.LOGS_COMMAND,
            'Download logs from non-consensus nodes (mirror, relay, explorer)',
            this.configCommand,
            this.configCommand.logs,
            ConfigCommandDefinition.LOGS_FLAGS_LIST,
            [],
          ),
        ),
      )
      .build();
  }
}
