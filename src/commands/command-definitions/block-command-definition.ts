// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BlockNodeCommand} from '../block-node.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

export class BlockCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.BlockNodeCommand) public readonly blockNodeCommand?: BlockNodeCommand,
  ) {
    super();
    this.blockNodeCommand = patchInject(blockNodeCommand, InjectTokens.BlockNodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'block';
  public static override readonly DESCRIPTION: string =
    'Block Node operations for creating, modifying, and destroying resources. ' +
    'These commands require the presence of an existing deployment.';

  public static readonly BLOCK_NODE_SUBCOMMAND_NAME: string = 'node';
  public static readonly BLOCK_NODE_SUBCOMMAND_DESCRIPTION: string =
    'Create, manage, or destroy block node instances. Operates on a single block node instance at a time.';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(BlockCommandDefinition.COMMAND_NAME, BlockCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          BlockCommandDefinition.BLOCK_NODE_SUBCOMMAND_NAME,
          BlockCommandDefinition.BLOCK_NODE_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              'add',
              'Creates and configures a new block node instance for the specified ' +
                'deployment using the specified Kubernetes cluster. ' +
                'The cluster must be accessible and attached to the specified deployment.',
              this.blockNodeCommand,
              this.blockNodeCommand.add,
              BlockNodeCommand.ADD_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'destroy',
              'Destroys a single block node instance in the specified deployment. ' +
                'Requires access to all Kubernetes clusters attached to the deployment.',
              this.blockNodeCommand,
              this.blockNodeCommand.destroy,
              BlockNodeCommand.DESTROY_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'upgrade',
              'Upgrades a single block node instance in the specified deployment. ' +
                'Requires access to all Kubernetes clusters attached to the deployment.',
              this.blockNodeCommand,
              this.blockNodeCommand.upgrade,
              BlockNodeCommand.UPGRADE_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
