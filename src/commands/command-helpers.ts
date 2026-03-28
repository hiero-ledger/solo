// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from './flags.js';
import {type CommandFlag} from '../types/flag-types.js';
import {type TaskListWrapper} from '../core/task-list/task-list-wrapper.js';
import {type Listr, type ListrContext, type ListrRendererValue} from 'listr2';
import {type TaskList} from '../core/task-list/task-list.js';
import {type TaskNodeType} from '../core/task-list/task-list.js';
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
  if (typeof developmentMode === 'boolean' && developmentMode) {
    argv.push(optionFromFlag(flags.devMode));
  }

  const quiet: boolean = configManager.getFlag<boolean>(flags.quiet);
  if (typeof quiet === 'boolean' && quiet) {
    argv.push(optionFromFlag(flags.quiet));
  }

  if (typeof cacheDirectory === 'string' && cacheDirectory.length > 0) {
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
  task: (context: any, taskListWrapper: any) => Promise<Listr<ListrContext, ListrRendererValue, ListrRendererValue>>;
} {
  return {
    title,
    skip: skipCallback || ((): boolean => false),
    task: async (_, taskListWrapper): Promise<Listr<ListrContext, ListrRendererValue, ListrRendererValue>> => {
      return taskListWrapper.newListr(
        [
          {
            title,
            task: async (
              _isolatedContext,
              isolatedTaskWrapper,
            ): Promise<
              | Listr<ListrContext, ListrRendererValue, ListrRendererValue>
              | Listr<ListrContext, ListrRendererValue, ListrRendererValue>[]
            > => {
              return subTaskSoloCommand(commandName, isolatedTaskWrapper, callback, taskList);
            },
          },
        ],
        {
          ctx: {},
        },
      );
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
  // one-shot can launch the same subcommand name in parallel (for example in
  // nested/parallel Listr branches). A single map slot per command name caused
  // last-writer-wins behavior, where one invocation overwrote another and task
  // output got attached to the wrong parent. Queueing preserves 1:1 pairing.
  const taskNode: TaskNodeType = {taskListWrapper};
  const pendingTaskNodes = taskList.parentTaskListMap.get(commandName) ?? [];
  pendingTaskNodes.push(taskNode);
  taskList.parentTaskListMap.set(commandName, pendingTaskNodes);

  const newArgv: string[] = callback();
  const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
  const scopedConfig = configManager.cloneActiveConfig();

  // ArgumentProcessor/command handlers read and write config flags deeply via
  // ConfigManager and Flags helpers. Running under a scoped copy keeps each
  // subcommand immutable from the perspective of siblings and removes shared
  // global-state races while still preserving existing call signatures.
  await configManager.runWithScopedConfig(scopedConfig, async (): Promise<void> => {
    await ArgumentProcessor.process(newArgv);
  });

  return taskNode.children;
}
