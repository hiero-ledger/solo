// SPDX-License-Identifier: Apache-2.0

import {BaseCommand} from '../base.js';
import fs from 'node:fs';
import * as constants from '../../core/constants.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {Flags as flags} from '../flags.js';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import {injectable} from 'tsyringe-neo';
import {type CommandDefinition} from '../../types/index.js';
import {InitConfig} from './init-config.js';
import {InitContext} from './init-context.js';
import {Listr, ListrRendererValue} from 'listr2';

/**
 * Defines the core functionalities of 'init' command
 */
@injectable()
export class InitCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'init';
  public static readonly INIT_COMMAND_NAME: string = InitCommand.COMMAND_NAME;

  // Although empty, tsyringe requires the constructor to be present
  public constructor() {
    super();
  }

  /** Executes the init CLI command */
  public async init(argv: any): Promise<boolean> {
    const self = this;

    let cacheDirectory: string = this.configManager.getFlag<string>(flags.cacheDir) as string;
    if (!cacheDirectory) {
      cacheDirectory = constants.SOLO_CACHE_DIR as string;
    }

    const tasks: Listr<InitContext, ListrRendererValue, ListrRendererValue> = this.taskList.newTaskList(
      [
        {
          title: 'Setup home directory and cache',
          task: async (context_, task) => {
            self.configManager.update(argv);
            context_.dirs = this.setupHomeDirectory();
            let username: string = self.configManager.getFlag<string>(flags.username);
            if (username && !flags.username.validate(username)) {
              username = await flags.username.prompt(task, username);
            }
            context_.config = {username} as InitConfig;
          },
        },
        {
          title: 'Check dependencies',
          task: (_, task) => {
            const deps = [constants.HELM, constants.KIND];

            const subTasks = self.depManager.taskCheckDependencies<InitContext>(deps);

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Create local configuration',
          skip: () => this.localConfig.configFileExists(),
          task: async (): Promise<void> => {
            await this.localConfig.load();
          },
        },
        {
          title: 'Setup chart manager',
          task: async context_ => {
            context_.repoURLs = await this.chartManager.setup();
          },
        },
        {
          title: `Copy templates in '${cacheDirectory}'`,
          task: context_ => {
            const resources = ['templates', 'profiles'];
            for (const directoryName of resources) {
              const sourceDirectory = PathEx.safeJoinWithBaseDirConfinement(
                constants.RESOURCES_DIR,
                constants.RESOURCES_DIR,
                directoryName,
              );
              if (!fs.existsSync(sourceDirectory)) {
                continue;
              }

              const destinationDirectory = PathEx.join(cacheDirectory, directoryName);
              if (!fs.existsSync(destinationDirectory)) {
                fs.mkdirSync(destinationDirectory, {recursive: true});
              }

              fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
            }

            if (argv.dev) {
              self.logger.showList('Home Directories', context_.dirs);
              self.logger.showList('Chart Repository', context_.repoURLs);
            }

            self.logger.showUser(
              chalk.grey('\n***************************************************************************************'),
            );
            self.logger.showUser(
              chalk.grey(
                `Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR}\n` +
                  "If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.",
              ),
            );
            self.logger.showUser(
              chalk.grey('***************************************************************************************'),
            );
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      undefined,
      InitCommand.INIT_COMMAND_NAME,
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error: Error | any) {
        throw new SoloError('Error running init', error);
      }
    }

    return true;
  }

  /**
   * Return Yargs command definition for 'init' command
   * @returns A object representing the Yargs command definition
   */
  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: InitCommand.COMMAND_NAME,
      desc: 'Initialize local environment',
      builder: (y: any) => {
        // set the quiet flag even though it isn't used for consistency across all commands
        flags.setOptionalCommandFlags(y, flags.cacheDir, flags.quiet, flags.username);
      },
      handler: async (argv: any) => {
        await self
          .init(argv)
          .then(r => {
            if (!r) {
              throw new SoloError('Error running init, expected return value to be true');
            }
          })
          .catch(error => {
            throw new SoloError('Error running init', error);
          });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
