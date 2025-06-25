// SPDX-License-Identifier: Apache-2.0

import {
  type ListrTaskObject,
  type Listr,
  type ListrBaseClassOptions,
  type ListrGetRendererClassFromValue,
  type ListrPrimaryRendererValue,
  type ListrRendererValue,
  type ListrSecondaryRendererValue,
  type ListrTask,
  type ListrContext,
} from 'listr2';
import {type QuickStartSingleDeployContext} from '../../commands/quick-start/quick-start-single-deploy-context.js';
import {type TaskListWrapper} from './task-list-wrapper.js';

export type TaskNodeType = {
  taskListWrapper: TaskListWrapper;
  children?: Listr<ListrContext, any, any> | Listr<ListrContext, any, any>[];
};

export interface TaskList<
  ListrContext,
  Renderer extends ListrRendererValue = ListrPrimaryRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrSecondaryRendererValue,
> {
  newQuickStartSingleDeployTaskList(
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
  ): Listr<QuickStartSingleDeployContext, Renderer, FallbackRenderer>;

  parentTaskListMap: Map<string, TaskNodeType>;

  newTaskList(
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
  ): Listr<ListrContext, Renderer, FallbackRenderer>;
}
