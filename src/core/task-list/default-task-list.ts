// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
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

@injectable()
export class DefaultTaskList<
  ListrContext,
  Renderer extends ListrRendererValue = ListrPrimaryRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrSecondaryRendererValue,
> implements TaskList<ListrContext, Renderer, FallbackRenderer>
{
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
    }
    return new Listr<ListrContext, Renderer, FallbackRenderer>(task, options, parentTask);
  }
}
