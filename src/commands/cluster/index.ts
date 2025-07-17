// SPDX-License-Identifier: Apache-2.0

import * as ContextFlags from './flags.js';
import {BaseCommand} from './../base.js';
import {type ClusterCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandDefinition} from '../../types/index.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';

/**
 * Defines the core functionalities of 'node' command
 */
@injectable()
export class ClusterCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ClusterCommandHandlers) public readonly handlers?: ClusterCommandHandlers) {
    super();

    this.handlers = patchInject(handlers, InjectTokens.ClusterCommandHandlers, this.constructor.name);
  }

  public static readonly COMMAND_NAME: 'cluster-ref' = 'cluster-ref' as const;
  public static readonly SUBCOMMAND_NAME: 'config' = 'config' as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(ClusterCommand.COMMAND_NAME, 'Manage solo testing cluster', this.logger)
      .addCommandGroup(
        new CommandGroup(ClusterCommand.SUBCOMMAND_NAME, '')
          .addSubcommand(
            new Subcommand(
              'connect',
              'Associates a cluster reference to a k8s context',
              this.handlers,
              this.handlers.connect,
              ContextFlags.CONNECT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'disconnect',
              'dissociates a cluster reference from a k8s context',
              this.handlers,
              this.handlers.disconnect,
              ContextFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'list',
              'List all available clusters',
              this.handlers,
              this.handlers.list,
              ContextFlags.NO_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'info',
              'Get information about the cluster',
              this.handlers,
              this.handlers.info,
              ContextFlags.DEFAULT_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'setup',
              'Setup cluster with shared components',
              this.handlers,
              this.handlers.setup,
              ContextFlags.SETUP_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              'reset',
              'Uninstall shared components from cluster',
              this.handlers,
              this.handlers.reset,
              ContextFlags.RESET_FLAGS,
            ),
          ),
      )
      .build();
  }

  public close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
