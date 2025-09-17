// SPDX-License-Identifier: Apache-2.0

import {type ListrRendererFactory, ListrTaskWrapper, type ListrContext} from 'listr2';

export class TaskListWrapper extends ListrTaskWrapper<ListrContext, ListrRendererFactory, ListrRendererFactory> {}
