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
import {QuickStartSingleDeployContext} from '../../commands/quick-start/quick-start-single-deploy-context.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';

@injectable()
export class DefaultTaskList<
  ListrContext,
  Renderer extends ListrRendererValue = ListrPrimaryRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrSecondaryRendererValue,
> implements TaskList<ListrContext, Renderer, FallbackRenderer>
{
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: any) {
    this.logger = patchInject(InjectTokens.SoloLogger, this.logger, this.constructor.name);
  }
  public newQuickStartSingleDeployTaskList(
    task:
      | ListrTask<
          QuickStartSingleDeployContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >
      | ListrTask<
          QuickStartSingleDeployContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >[],
    options?: ListrBaseClassOptions<QuickStartSingleDeployContext, Renderer, FallbackRenderer>,
    parentTask?: ListrTaskObject<
      any,
      ListrGetRendererClassFromValue<Renderer>,
      ListrGetRendererClassFromValue<FallbackRenderer>
    >,
  ): Listr<QuickStartSingleDeployContext, Renderer, FallbackRenderer> {
    return new Listr<QuickStartSingleDeployContext, Renderer, FallbackRenderer>(task, options, parentTask);
  }

  public parentTaskListMap: Map<string, TaskNodeType> = new Map();

  public newTaskList(
    task:
      | ListrTask<
          ListrContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >
      | ListrTask<
          ListrContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >[],
    options?: ListrBaseClassOptions<ListrContext, Renderer, FallbackRenderer>,
    parentTask?: ListrTaskObject<
      ListrContext,
      ListrGetRendererClassFromValue<Renderer>,
      ListrGetRendererClassFromValue<FallbackRenderer>
    >,
    commandName?: string,
  ): Listr<ListrContext, Renderer, FallbackRenderer> {
    if (this.parentTaskListMap.has(commandName)) {
      const parentTaskList: TaskNodeType = this.parentTaskListMap.get(commandName);
      parentTaskList.children = parentTaskList.taskListWrapper.newListr(task, options);
      return parentTaskList.children as Listr<ListrContext, Renderer, FallbackRenderer>;
    }
    return new Listr<ListrContext, Renderer, FallbackRenderer>(task, options, parentTask);
  }

  private trailingCloseFunctions: Array<() => Promise<void>> = [];

  public registerCloseFunction(trailingCloseFunction: () => Promise<void>): void {
    this.trailingCloseFunctions.push(trailingCloseFunction);
  }

  public async callCloseFunctions(): Promise<void> {
    for (const closeFunction of this.trailingCloseFunctions) {
      try {
        await closeFunction();
      } catch (error) {
        // Log the error or handle it as needed
        this.logger.error('Error during trailing close function:', error);
      }
    }
    this.trailingCloseFunctions = []; // Clear the functions after execution
  }
}
