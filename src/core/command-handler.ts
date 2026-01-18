// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from './logging/solo-logger.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {SoloError} from './errors/solo-error.js';
import {type Lock} from './lock/lock.js';
import * as constants from './constants.js';
import fs from 'node:fs';
import {type ConfigManager} from './config-manager.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type AccountManager} from './account-manager.js';
import {type TaskList} from './task-list/task-list.js';
import {ListrContext, ListrRendererValue} from 'listr2';

@injectable()
export class CommandHandler {
  protected readonly _configMaps: Map<string, any> = new Map<string, any>();

  public constructor(
    @inject(InjectTokens.SoloLogger) public readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
    @inject(InjectTokens.TaskList)
    private readonly taskList?: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
  }

  public async commandAction(
    argv: any,
    actionTasks: any,
    options: any,
    errorString: string,
    lease: Lock | null,
    commandName?: string,
  ): Promise<void> {
    if (!commandName) {
      commandName = argv._.slice(0, 3).join(' ');
    }
    const tasks = this.taskList.newTaskList([...actionTasks], options, undefined, commandName);
    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error: Error | any) {
        throw new SoloError(`${errorString}: ${error.message}`, error);
      } finally {
        const promises = [];
        if (lease) {
          promises.push(lease?.release());
        }
        promises.push(this.accountManager.close());
        await Promise.all(promises);
        // this.cleanupStdin();
        // this.scheduleExitIfIdle();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        const promises = [];
        if (lease) {
          promises.push(lease?.release());
        }
        promises.push(this.accountManager.close());
        await Promise.all(promises);
        // this.cleanupStdin();
        // this.scheduleExitIfIdle();
      });
    }
  }


  private cleanupStdin(): void {
    try {
      if (process.stdin?.isTTY) {
        if (typeof process.stdin.setRawMode === 'function') {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdin.unref?.();
      }
      process.stdout?.unref?.();
      process.stderr?.unref?.();
    } catch (error) {
      this.logger.debug(`Failed to cleanup stdin: ${error.message}`);
    }
  }

  private scheduleExitIfIdle(): void {
    const timeoutMs = 1500;
    const timer = setTimeout((): void => {
      this.logger.warn(`Process still running ${timeoutMs}ms after cleanup; forcing exit`);
      process.exitCode = process.exitCode ?? 0;
      process.exit(0);
    }, timeoutMs);
    timer.unref();
    process.once('exit', (): void => clearTimeout(timer));
  }


  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  public setupHomeDirectory(
    directories: string[] = [
      constants.SOLO_HOME_DIR,
      constants.SOLO_LOGS_DIR,
      constants.SOLO_CACHE_DIR,
      constants.SOLO_VALUES_DIR,
    ],
  ): string[] {
    const self = this;

    try {
      for (const directoryPath of directories) {
        if (!fs.existsSync(directoryPath)) {
          fs.mkdirSync(directoryPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${directoryPath}`);
      }
    } catch (error: Error | any) {
      throw new SoloError(`failed to create directory: ${error.message}`, error);
    }

    return directories;
  }

  public getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }
}
