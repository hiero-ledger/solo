// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {UpgradeCommand} from '../upgrade.js';
import * as constants from '../../core/constants.js';

@injectable()
export class UpgradeCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.UpgradeCommand) public readonly upgradeCommand?: UpgradeCommand,
  ) {
    super();
    this.upgradeCommand = patchInject(upgradeCommand, InjectTokens.UpgradeCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'upgrade';
  protected static override readonly DESCRIPTION =
    'Upgrade all network components to their latest versions. ' +
    'This command will upgrade consensus nodes, mirror node, relay, explorer, and block node.';

  public static readonly ALL_SUBCOMMAND = 'all';

  public static readonly ALL_COMMAND = `${UpgradeCommandDefinition.COMMAND_NAME}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(UpgradeCommandDefinition.COMMAND_NAME, UpgradeCommandDefinition.DESCRIPTION, this.logger)
      .addCommandGroup(
        new CommandGroup(
          'all',
          'Upgrades all network components to their latest versions. Components already at the latest version will be skipped.',
        ).addSubcommand(
          new Subcommand(
            'all',
            'Upgrades all network components to their latest versions. Components already at the latest version will be skipped.',
            this.upgradeCommand,
            this.upgradeCommand.all,
            UpgradeCommand.UPGRADE_ALL_FLAGS_LIST,
            [constants.HELM, constants.KUBECTL],
          ),
        ),
      )
      .build();
  }
}
