// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';

@injectable()
export class TransactionToolCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.TransactionToolCommand) public readonly transactionToolCommand?: TransactionToolCommand,
  ) {
    super();
    this.transactionToolCommand = patchInject(
      transactionToolCommand,
      InjectTokens.TransactionToolCommand,
      this.constructor.name,
    );
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'transaction-tool';
  protected static override readonly DESCRIPTION: string = '';

  public static readonly BACKEND_SUBCOMMAND_NAME = 'backend';
  private static readonly BACKEND_SUBCOMMAND_DESCRIPTION = '';

  public static readonly BACKEND_ADD = 'add';
  public static readonly BACKEND_DESTROY = 'destroy';

  public static readonly ADD_COMMAND: string =
    `${TransactionToolCommandDefinition.COMMAND_NAME} ${TransactionToolCommandDefinition.BACKEND_SUBCOMMAND_NAME} ${TransactionToolCommandDefinition.BACKEND_ADD}` as const;
  public static readonly DESTROY_COMMAND: string =
    `${TransactionToolCommandDefinition.COMMAND_NAME} ${TransactionToolCommandDefinition.BACKEND_SUBCOMMAND_NAME} ${TransactionToolCommandDefinition.BACKEND_DESTROY}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      TransactionToolCommandDefinition.COMMAND_NAME,
      TransactionToolCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          TransactionToolCommandDefinition.BACKEND_SUBCOMMAND_NAME,
          TransactionToolCommandDefinition.BACKEND_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              TransactionToolCommandDefinition.BACKEND_ADD,
              'Creates and configures a new block node instance for the specified ' +
                'deployment using the specified Kubernetes cluster. ' +
                'The cluster must be accessible and attached to the specified deployment.',
              this.transactionToolCommand,
              this.transactionToolCommand.add,
              TransactionToolCommand.ADD_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              TransactionToolCommandDefinition.BACKEND_DESTROY,
              'Destroys a single block node instance in the specified deployment. ' +
                'Requires access to all Kubernetes clusters attached to the deployment.',
              this.transactionToolCommand,
              this.transactionToolCommand.destroy,
              TransactionToolCommand.DESTROY_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .build();
  }
}
