// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {DeploymentCommand} from '../deployment.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class DeploymentCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DeploymentCommand) public readonly deploymentCommand?: DeploymentCommand,
  ) {
    super();
    this.deploymentCommand = patchInject(deploymentCommand, InjectTokens.DeploymentCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME: string = 'deployment';
  protected static override readonly DESCRIPTION: string =
    'Create, modify, and delete deployment configurations. ' +
    'Deployments are required for most of the other commands.';

  public static readonly CLUSTER_SUBCOMMAND_NAME: string = 'cluster';
  private static readonly CLUSTER_SUBCOMMAND_DESCRIPTION: string =
    'View and manage Solo cluster references used by a deployment.';

  public static readonly CONFIG_SUBCOMMAND_NAME: string = 'config';
  private static readonly CONFIG_SUBCOMMAND_DESCRIPTION: string =
    'List, view, create, delete, and import deployments. These commands affect the local configuration only.';

  public static readonly STATE_SUBCOMMAND_NAME: string = 'state';
  private static readonly STATE_SUBCOMMAND_DESCRIPTION: string =
    'View the actual state of the deployment on the Kubernetes clusters or ' +
    'teardown/destroy all remote and local configuration for a given deployment.';

  public static readonly CLUSTER_ATTACH: string = 'attach';

  public static readonly CONFIGS_LIST: string = 'list';
  public static readonly CONFIGS_CREATE: string = 'create';
  public static readonly CONFIGS_DELETE: string = 'delete';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_DESCRIPTION,
        ).addSubcommand(
          new Subcommand(
            DeploymentCommandDefinition.CLUSTER_ATTACH,
            'Attaches a cluster reference to a deployment.',
            this,
            this.deploymentCommand.addCluster,
            DeploymentCommand.ADD_CLUSTER_FLAGS_LIST,
          ),
        ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.CONFIG_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIGS_LIST,
              'Lists all local deployment configurations.',
              this.deploymentCommand,
              this.deploymentCommand.list,
              DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIGS_CREATE,
              'Creates a new local deployment configuration.',
              this.deploymentCommand,
              this.deploymentCommand.create,
              DeploymentCommand.CREATE_FLAGS_LIST,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIGS_DELETE,
              'Removes a local deployment configuration.',
              this.deploymentCommand,
              this.deploymentCommand.delete,
              DeploymentCommand.DESTROY_FLAGS_LIST,
            ),
          ),
      )
      .build();
  }
}
