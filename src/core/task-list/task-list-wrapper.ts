// SPDX-License-Identifier: Apache-2.0

import {type ListrRendererFactory, ListrTaskWrapper, type ListrContext} from 'listr2';

// @ts-expect-error - ListrTaskWrapper is exported as a type even though it is declared as a class
export class TaskListWrapper extends ListrTaskWrapper<ListrContext, ListrRendererFactory, ListrRendererFactory> {}
