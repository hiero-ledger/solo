// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {DeploymentCommand} from '../deployment.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {NodeCommand} from '../node/index.js';
import * as NodeFlags from '../node/flags.js';

@injectable()
export class DeploymentCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.DeploymentCommand) public readonly deploymentCommand?: DeploymentCommand,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
  ) {
    super();
    this.deploymentCommand = patchInject(deploymentCommand, InjectTokens.DeploymentCommand, this.constructor.name);
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
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

  public static readonly DIAGNOSTICS_SUBCOMMAND_NAME: string = 'diagnostics';
  private static readonly DIAGNOSTIC_SUBCOMMAND_DESCRIPTION: string =
    'Capture diagnostic information such as logs, signed states, and ledger/network/node configurations.';

  public static readonly CLUSTER_ATTACH: string = 'attach';

  public static readonly CONFIG_LIST: string = 'list';
  public static readonly CONFIG_CREATE: string = 'create';
  public static readonly CONFIG_DELETE: string = 'delete';

  public static readonly DIAGNOSTIC_ALL: string = 'all';
  public static readonly DIAGNOSTIC_DEBUG: string = 'debug';
  public static readonly DIAGNOSTIC_LOGS: string = 'logs';
  public static readonly DIAGNOSTIC_CONNECTIONS: string = 'connections';

  public static readonly CREATE_COMMAND =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_CREATE}` as const;

  public static readonly ATTACH_COMMAND =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CLUSTER_ATTACH}` as const;

  public static readonly DELETE_COMMAND =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.CONFIG_DELETE}` as const;

  public static readonly CONNECTIONS_COMMAND =
    `${DeploymentCommandDefinition.COMMAND_NAME} ${DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME} ${DeploymentCommandDefinition.DIAGNOSTIC_CONNECTIONS}` as const;

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
            this.deploymentCommand,
            this.deploymentCommand.addCluster,
            DeploymentCommand.ADD_CLUSTER_FLAGS_LIST,
            [constants.KUBECTL],
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
              DeploymentCommandDefinition.CONFIG_LIST,
              'Lists all local deployment configurations or deployments in a specific cluster.',
              this.deploymentCommand,
              this.deploymentCommand.list,
              DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_CREATE,
              'Creates a new local deployment configuration.',
              this.deploymentCommand,
              this.deploymentCommand.create,
              DeploymentCommand.CREATE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.CONFIG_DELETE,
              'Removes a local deployment configuration.',
              this.deploymentCommand,
              this.deploymentCommand.delete,
              DeploymentCommand.DESTROY_FLAGS_LIST,
              [],
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
          DeploymentCommandDefinition.DIAGNOSTIC_SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTIC_ALL,
              'Captures logs, configs, and diagnostic artifacts from all consensus nodes and test connections.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.all,
              NodeFlags.DIAGNOSTICS_CONNECTIONS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTIC_DEBUG,
              'Captures all diagnostic information (logs, configs, artifacts) and creates a zip archive for easy sharing.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.debug,
              NodeFlags.LOGS_FLAGS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTIC_CONNECTIONS,
              'Tests connections to Consensus, Relay, Explorer, Mirror and Block nodes.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.connections,
              NodeFlags.DIAGNOSTICS_CONNECTIONS,
            ),
          )
          .addSubcommand(
            new Subcommand(
              DeploymentCommandDefinition.DIAGNOSTIC_LOGS,
              'Get logs and configuration files from consensus node/nodes.',
              this.nodeCommand.handlers,
              this.nodeCommand.handlers.logs,
              NodeFlags.LOGS_FLAGS,
            ),
          ),
      )
      .build();
  }
}
