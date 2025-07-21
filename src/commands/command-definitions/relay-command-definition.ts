// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {MirrorNodeCommand} from '../mirror-node.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {RelayCommand} from '../relay.js';

@injectable()
export class RelayCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.RelayCommand) public readonly relayCommand?: RelayCommand,
  ) {
    super();
    this.relayCommand = patchInject(relayCommand, InjectTokens.RelayCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'relay';
  protected static override readonly DESCRIPTION: string =
    'RPC Relay Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly NODE_SUBCOMMAND_NAME: string = 'node';
  private static readonly NODE_SUBCOMMAND_DESCRIPTION: string =
    'List, create, manage, or destroy relay node instances. Operates on a single relay node instance at a time.';

  public static readonly NODE_ADD: string = 'add';
  public static readonly NODE_DESTROY: string = 'destroy';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(RelayCommandDefinition.COMMAND_NAME, RelayCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
          RelayCommandDefinition.NODE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              RelayCommandDefinition.NODE_ADD,
              'Adds and configures a new node instance.',
              this,
              this.relayCommand.add,
              MirrorNodeCommand.DEPLOY_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RelayCommandDefinition.NODE_DESTROY,
              'Deletes the specified node from the deployment.',
              this,
              this.relayCommand.destroy,
              MirrorNodeCommand.DESTROY_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
