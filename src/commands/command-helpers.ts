// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from './flags.js';
import {type CommandFlag} from '../types/flag-types.js';
import {type TaskListWrapper} from '../core/task-list/task-list-wrapper.js';
import {type Listr, type ListrContext, type ListrRendererValue} from 'listr2';
import {type TaskList} from '../core/task-list/task-list.js';
import {ArgumentProcessor} from '../argument-processor.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type ConfigManager} from '../core/config-manager.js';

/**
 * Helper function to convert a flag object to CLI option string
 * @param flag - The command flag
 * @returns CLI option string (e.g., '--deployment')
 */
export function optionFromFlag(flag: CommandFlag): string {
  return `--${flag.name}`;
}

/**
 * Helper function to create base argv array for command execution
 * @returns Base argv array
 */
export function newArgv(): string[] {
  return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
}

/**
 * Helper function to append global flags to argv
 * @param argv - The argument array to append to
 * @param cacheDirectory - Optional cache directory path
 * @returns Updated argv array
 */
export function argvPushGlobalFlags(argv: string[], cacheDirectory: string = ''): string[] {
  // Only propagate flags if they are explicitly set to true in the parent command
  const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);

  const developmentMode: boolean = configManager.getFlag<boolean>(flags.devMode);
  if (developmentMode) {
    argv.push(optionFromFlag(flags.devMode));
  }

  const quiet: boolean = configManager.getFlag<boolean>(flags.quiet);
  if (quiet) {
    argv.push(optionFromFlag(flags.quiet));
  }

  if (cacheDirectory) {
    argv.push(optionFromFlag(flags.cacheDir), cacheDirectory);
  }
  return argv;
}

/**
 * Helper function to invoke a Solo command with proper task integration
 * @param title - Task title to display
 * @param commandName - Command name for task tracking
 * @param callback - Function that returns the argv array
 * @param taskList - TaskList instance for managing parent-child task relationships
 * @param skipCallback - Optional function to determine if task should be skipped
 * @returns Task object for Listr
 */
export function invokeSoloCommand(
  title: string,
  commandName: string,
  callback: () => string[],
  taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
  skipCallback?: () => boolean,
): {
  title: string;
  skip: () => boolean;
  task: (
    context: any,
    taskListWrapper: any,
  ) => Promise<
    | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
    | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
  >;
} {
  return {
    title,
    skip: skipCallback || ((): boolean => false),
    task: async (
      _,
      taskListWrapper,
    ): Promise<
      | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
      | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
    > => {
      return subTaskSoloCommand(commandName, taskListWrapper, callback, taskList);
    },
  };
}

/**
 * Helper function to execute a Solo command and return child tasks
 * @param commandName - Command name for task tracking
 * @param taskListWrapper - Task list wrapper from Listr
 * @param callback - Function that returns the argv array
 * @param taskList - TaskList instance for managing parent-child task relationships
 * @returns Child tasks from command execution
 */
export async function subTaskSoloCommand(
  commandName: string,
  taskListWrapper: TaskListWrapper,
  callback: () => string[],
  taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
): Promise<
  | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
  | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
> {
  taskList.parentTaskListMap.set(commandName, {taskListWrapper});
  const newArgv: string[] = callback();
  await ArgumentProcessor.process(newArgv);
  return taskList.parentTaskListMap.get(commandName).children;
}
