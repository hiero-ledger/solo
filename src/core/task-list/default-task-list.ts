// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {TaskList} from './task-list.js';
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
import {type InitContext} from '../../commands/init/init-context.js';
import {TaskListWrapper} from './task-list-wrapper.js';

@injectable()
export class DefaultTaskList<
  ListrContext,
  Renderer extends ListrRendererValue = ListrPrimaryRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrSecondaryRendererValue,
> implements TaskList<QuickStartSingleDeployContext, Renderer, FallbackRenderer>
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

  public initTaskListParent?: TaskListWrapper;

  public newInitTaskList(
    task:
      | ListrTask<
          InitContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >
      | ListrTask<
          InitContext,
          ListrGetRendererClassFromValue<Renderer>,
          ListrGetRendererClassFromValue<FallbackRenderer>
        >[],
    options?: ListrBaseClassOptions<InitContext, Renderer, FallbackRenderer>,
    parentTask?: ListrTaskObject<
      any,
      ListrGetRendererClassFromValue<Renderer>,
      ListrGetRendererClassFromValue<FallbackRenderer>
    >,
  ): Listr<InitContext, Renderer, FallbackRenderer> {
    return this.initTaskListParent
      ? this.initTaskListParent.newListr(task, options)
      : new Listr<InitContext, Renderer, FallbackRenderer>(task, options, parentTask);
  }
}
