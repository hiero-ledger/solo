// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {BackupRestoreCommand} from '../backup-restore.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class BackupRestoreCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.BackupRestoreCommand) public readonly backupRestoreCommand?: BackupRestoreCommand,
  ) {
    super();
    this.backupRestoreCommand = patchInject(
      backupRestoreCommand,
      InjectTokens.BackupRestoreCommand,
      this.constructor.name,
    );
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'config';
  protected static override readonly DESCRIPTION =
    'Backup and restore component configurations for Solo deployments. ' +
    'These commands display what would be backed up or restored without performing actual operations.';

  public static readonly SUBCOMMAND_NAME = 'ops';
  private static readonly SUBCOMMAND_DESCRIPTION = 'Configuration backup and restore operations';

  public static readonly BACKUP_COMMAND = 'backup';
  public static readonly RESTORE_COMMAND = 'restore';
  public static readonly RESTORE_NETWORK_COMMAND = 'restore-network';

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      BackupRestoreCommandDefinition.COMMAND_NAME,
      BackupRestoreCommandDefinition.DESCRIPTION,
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup(
          BackupRestoreCommandDefinition.SUBCOMMAND_NAME,
          BackupRestoreCommandDefinition.SUBCOMMAND_DESCRIPTION,
        )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.BACKUP_COMMAND,
              'Display backup plan for all component configurations of a deployment. ' +
                'Shows what files and configurations would be backed up without performing the actual backup.',
              this.backupRestoreCommand,
              this.backupRestoreCommand.backup,
              BackupRestoreCommand.BACKUP_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.RESTORE_COMMAND,
              'Display restore plan for all component configurations of a deployment. ' +
                'Shows what files and configurations would be restored without performing the actual restore.',
              this.backupRestoreCommand,
              this.backupRestoreCommand.restore,
              BackupRestoreCommand.RESTORE_FLAGS_LIST,
              [],
            ),
          )
          .addSubcommand(
            new Subcommand(
              BackupRestoreCommandDefinition.RESTORE_NETWORK_COMMAND,
              'Restore network components from backup directory structure. ' +
                'Scans the backup directory for cluster contexts, reads network topology from solo-remote-config.yaml, ' +
                'and deploys all components (consensus nodes, block nodes, mirror nodes, explorers, relay nodes) to fresh clusters. ' +
                'Expected directory structure: <input-dir>/<context-name>/configmaps/solo-remote-config.yaml',
              this.backupRestoreCommand,
              this.backupRestoreCommand.restoreNetwork,
              BackupRestoreCommand.RESTORE_NETWORK_FLAGS_LIST,
              [],
            ),
          ),
      )
      .build();
  }
}
