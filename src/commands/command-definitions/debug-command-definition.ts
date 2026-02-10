// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {DebugCommand} from '../debug.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class DebugCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DebugCommand) public readonly debugCommand?: DebugCommand,
  ) {
    super();
    this.debugCommand = patchInject(debugCommand, InjectTokens.DebugCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'debug';
  protected static override readonly DESCRIPTION =
    'Collect comprehensive diagnostic information from Solo deployments. ' +
    'Gathers cluster information, helm releases, pod logs, deployment resources, and system details into a single zip file for troubleshooting.';

  public static readonly SUBCOMMAND_NAME = 'ops';
  private static readonly SUBCOMMAND_DESCRIPTION = 'Debug and diagnostic operations';

  public static readonly COLLECT_COMMAND = 'collect';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(DebugCommandDefinition.COMMAND_NAME, DebugCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          DebugCommandDefinition.SUBCOMMAND_NAME,
          DebugCommandDefinition.SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            DebugCommandDefinition.COLLECT_COMMAND,
            'Collect all diagnostic information from the cluster and save as a zip archive. ' +
              'Includes cluster info, helm releases, pod logs, deployment resources, network node configurations, and system information.',
            this.debugCommand,
            this.debugCommand.collect,
            DebugCommand.COLLECT_FLAGS_LIST,
            [],
          ),
        ),
      )
      .build();
  }
}
