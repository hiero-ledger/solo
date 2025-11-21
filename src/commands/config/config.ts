// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {type ConfigCommandTasks} from './tasks.js';
import {type ArgvStruct} from '../../types/aliases.js';
import {type DeploymentName} from '../../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {CommandHandler} from '../../core/command-handler.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {BaseCommand} from '../base.js';

@injectable()
export class ConfigCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.ConfigCommandTasks) private readonly tasks: ConfigCommandTasks) {
    super();
  }

  public async logs(argv: ArgvStruct): Promise<boolean> {
    argv = this.addFlagsToArgv(argv);

    const outputDirectory: string = (argv.outputDir as string) || '';

    await this.commandAction(
      argv,
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            await this.localConfig.load();
          },
        },
        this.tasks.downloadNonConsensusNodeLogs(outputDirectory),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      'Error downloading non-consensus node logs',
      null,
    );

    return true;
  }

  public async close(): Promise<void> {} // no-op

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
