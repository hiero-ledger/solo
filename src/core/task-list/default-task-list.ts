// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {TaskList, TaskNodeType} from './task-list.js';
import {
  Listr,
  ListrBaseClassOptions,
  ListrGetRendererClassFromValue,
  ListrPrimaryRendererValue,
  ListrRendererValue,
  ListrSecondaryRendererValue,
  ListrTask,
  ListrTaskObject,
} from 'listr2';
import {OneShotSingleDeployContext} from '../../commands/one-shot/one-shot-single-deploy-context.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {AnyListrContext} from '../../types/aliases.js';
import {OneShotSingleDestroyContext} from '../../commands/one-shot/one-shot-single-destroy-context.js';

@injectable()
export class DefaultTaskList<
  ListrContext,
  Renderer extends ListrRendererValue = ListrPrimaryRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrSecondaryRendererValue,
> implements TaskList<ListrContext, Renderer, FallbackRenderer> {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: any) {
    this.logger = patchInject(InjectTokens.SoloLogger, this.logger, this.constructor.name);
  }
  public newOneShotSingleDeployTaskList(
    task:
      | ListrTask<
          OneShotSingleDeployContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >
      | ListrTask<
          OneShotSingleDeployContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >[],
    options?: ListrBaseClassOptions<OneShotSingleDeployContext, Renderer, FallbackRenderer>,
    parentTask?: ListrTaskObject<
      any,
      ListrGetRendererClassFromValue<Renderer>,
      ListrGetRendererClassFromValue<FallbackRenderer>
    >,
  ): Listr<OneShotSingleDeployContext, Renderer, FallbackRenderer> {
    return new Listr<OneShotSingleDeployContext, Renderer, FallbackRenderer>(task, options, parentTask);
  }

  public newOneShotSingleDestroyTaskList(
    task:
      | ListrTask<
          OneShotSingleDestroyContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >
      | ListrTask<
          OneShotSingleDestroyContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >[],
    options?: ListrBaseClassOptions<OneShotSingleDestroyContext, Renderer, FallbackRenderer>,
    parentTask?: ListrTaskObject<
      any,
      ListrGetRendererClassFromValue<Renderer>,
      ListrGetRendererClassFromValue<FallbackRenderer>
    >,
  ): Listr<OneShotSingleDestroyContext, Renderer, FallbackRenderer> {
    return new Listr<OneShotSingleDestroyContext, Renderer, FallbackRenderer>(task, options, parentTask);
  }

  // Queue of pending parent task wrappers keyed by command name. A queue is
  // required because the same command can be invoked concurrently.
  public parentTaskListMap: Map<string, TaskNodeType[]> = new Map();

  public newTaskList<T = AnyListrContext>(
    task:
      | ListrTask<T, ListrGetRendererClassFromValue<Renderer>, ListrGetRendererClassFromValue<FallbackRenderer>>
      | ListrTask<T, ListrGetRendererClassFromValue<Renderer>, ListrGetRendererClassFromValue<FallbackRenderer>>[],
    options?: ListrBaseClassOptions<T, Renderer, FallbackRenderer>,
    parentTask?: ListrTaskObject<
      T,
      ListrGetRendererClassFromValue<Renderer>,
      ListrGetRendererClassFromValue<FallbackRenderer>
    >,
    commandName?: string,
  ): Listr<T, Renderer, FallbackRenderer> {
    if (commandName && this.parentTaskListMap.has(commandName)) {
      // Consume exactly one queued parent node for this invocation. Using
      // `shift()` keeps FIFO pairing with the enqueue point in
      // `subTaskSoloCommand()`, avoiding cross-assignment of child tasks.
      const pendingParentTaskLists: TaskNodeType[] = this.parentTaskListMap.get(commandName) ?? [];
      const parentTaskList: TaskNodeType | undefined = pendingParentTaskLists.shift();
      if (pendingParentTaskLists.length === 0) {
        this.parentTaskListMap.delete(commandName);
      }
      if (parentTaskList) {
        parentTaskList.children = parentTaskList.taskListWrapper.newListr(task, options);
        return parentTaskList.children as Listr<T, Renderer, FallbackRenderer>;
      }
    }
    return new Listr<T, Renderer, FallbackRenderer>(task, options, parentTask);
  }

  private trailingCloseFunctions: Array<() => Promise<void>> = [];

  public registerCloseFunction(trailingCloseFunction: () => Promise<void>): void {
    this.trailingCloseFunctions.push(trailingCloseFunction);
  }

  public async callCloseFunctions(): Promise<void> {
    for (const closeFunction of this.trailingCloseFunctions) {
      try {
        await closeFunction()
          .then()
          .catch((error): void => {
            // Log the error or handle it as needed
            this.logger.error('Error during trailing close function:', error);
          });
      } catch (error) {
        // Log the error or handle it as needed
        this.logger.error('Error during trailing close function:', error);
      }
    }
    this.trailingCloseFunctions = []; // Clear the functions after execution
  }
}
