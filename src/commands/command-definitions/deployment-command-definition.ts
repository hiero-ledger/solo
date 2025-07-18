// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {NodeCommand} from '../node/index.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

export class ConsensusCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'deployment';
  public static override readonly DESCRIPTION: string =
    'Create, modify, and delete deployment configurations. ' +
    'Deployments are required for most of the other commands.';

  public static readonly CLUSTER_SUBCOMMAND_NAME: string = 'cluster';
  public static readonly CLUSTER_SUBCOMMAND_DESCRIPTION: string =
    'View and manage Solo cluster references used by a deployment.';

  public static readonly CONFIG_SUBCOMMAND_NAME: string = 'config';
  public static readonly CONFIG_SUBCOMMAND_DESCRIPTION: string =
    'List, view, create, delete, and import deployments. These commands affect the local configuration only.';

  public static readonly STATE_SUBCOMMAND_NAME: string = 'state';
  public static readonly STATE_SUBCOMMAND_DESCRIPTION: string =
    'View the actual state of the deployment on the Kubernetes clusters or ' +
    'teardown/destroy all remote and local configuration for a given deployment.';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          ConsensusCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.CLUSTER_SUBCOMMAND_DESCRIPTION,
        )

      )
      .addCommandGroup(
        new CommandGroup(
          ConsensusCommandDefinition.CONFIG_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.CONFIG_SUBCOMMAND_DESCRIPTION,
        )

      )
      .addCommandGroup(
        new CommandGroup(
          ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.STATE_SUBCOMMAND_DESCRIPTION,
        )

      )
      .build();
  }
}
