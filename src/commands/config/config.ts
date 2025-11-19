// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {type ConfigCommandTasks} from './tasks.js';
import {type ArgvStruct} from '../../types/aliases.js';
import {type DeploymentName} from '../../types/index.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {CommandHandler} from '../../core/command-handler.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

@injectable()
export class ConfigCommand {
  public constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.LockManager) private readonly lockManager: LockManager,
    @inject(InjectTokens.ConfigCommandTasks) private readonly tasks: ConfigCommandTasks,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
  ) {}

  public async logs(argv: ArgvStruct): Promise<boolean> {
    argv = this.addFlagsToArgv(argv);
    
    await this.commandAction(
      argv,
      [
        this.tasks.downloadNonConsensusNodeLogs(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error downloading non-consensus node logs',
      null,
    );

    return true;
  }

  private addFlagsToArgv(argv: ArgvStruct): ArgvStruct {
    return {
      ...argv,
      deployment: argv.deployment || this.configManager.getFlag<DeploymentName>(flags.deployment),
    };
  }

  private async commandAction(
    argv: ArgvStruct,
    actionTasks: any[],
    options: any,
    errorString: string,
    lease: any,
  ): Promise<void> {
    const commandHandler = new CommandHandler(this.logger, this.configManager);
    await commandHandler.commandAction(argv, actionTasks, options, errorString, lease, 'config ops logs');
  }
}
