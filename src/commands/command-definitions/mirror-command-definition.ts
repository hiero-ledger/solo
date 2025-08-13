// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {MirrorNodeCommand} from '../mirror-node.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class MirrorCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.MirrorNodeCommand) public readonly mirrorNodeCommand?: MirrorNodeCommand,
  ) {
    super();
    this.mirrorNodeCommand = patchInject(mirrorNodeCommand, InjectTokens.MirrorNodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'mirror';
  protected static override readonly DESCRIPTION: string =
    'Mirror Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly NODE_SUBCOMMAND_NAME: string = 'node';
  private static readonly NODE_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, or destroy mirror node instances. Operates on a single mirror node instance at a time.';

  public static readonly NODE_ADD: string = 'add';
  public static readonly NODE_DESTROY: string = 'destroy';

  public static readonly DEPLOY_COMMAND: string = `${MirrorCommandDefinition.COMMAND_NAME} ${MirrorCommandDefinition.NODE_SUBCOMMAND_NAME} ${MirrorCommandDefinition.NODE_ADD}`;
  public static readonly DESTROY_COMMAND: string = `${MirrorCommandDefinition.COMMAND_NAME} ${MirrorCommandDefinition.NODE_SUBCOMMAND_NAME} ${MirrorCommandDefinition.NODE_DESTROY}`;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(MirrorCommandDefinition.COMMAND_NAME, MirrorCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          MirrorCommandDefinition.NODE_SUBCOMMAND_NAME,
          MirrorCommandDefinition.NODE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              MirrorCommandDefinition.NODE_ADD,
              'Adds and configures a new node instance.',
              this.mirrorNodeCommand,
              this.mirrorNodeCommand.add,
              MirrorNodeCommand.DEPLOY_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              MirrorCommandDefinition.NODE_DESTROY,
              'Deletes the specified node from the deployment.',
              this.mirrorNodeCommand,
              this.mirrorNodeCommand.destroy,
              MirrorNodeCommand.DESTROY_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
