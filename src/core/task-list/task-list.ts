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
} from 'listr2';
import {type OneShotSingleDeployContext} from '../../commands/one-shot/one-shot-single-deploy-context.js';
import {type TaskListWrapper} from './task-list-wrapper.js';
import {type OneShotSingleDestroyContext} from '../../commands/one-shot/one-shot-single-destroy-context.js';
import {type AnyListrContext} from '../../types/aliases.js';

export type TaskNodeType = {
  taskListWrapper: TaskListWrapper;
  children?: Listr<AnyListrContext, any, any> | Listr<AnyListrContext, any, any>[];
};

export interface TaskList<
  _ListrContext,
  Renderer extends ListrRendererValue = ListrPrimaryRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrSecondaryRendererValue,
> {
  newOneShotSingleDeployTaskList(
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
  ): Listr<OneShotSingleDeployContext, Renderer, FallbackRenderer>;

  newOneShotSingleDestroyTaskList(
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
  ): Listr<OneShotSingleDestroyContext, Renderer, FallbackRenderer>;

  parentTaskListMap: Map<string, TaskNodeType>;

  newTaskList<T = AnyListrContext>(
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
  ): Listr<T, Renderer, FallbackRenderer>;

  registerCloseFunction(trailingCloseFunction: () => Promise<void>): void;

  callCloseFunctions(): Promise<void>;
}
