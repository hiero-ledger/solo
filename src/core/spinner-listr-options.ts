// SPDX-License-Identifier: Apache-2.0

import {type ListrBaseClassOptions, type ListrRendererValue, ListrDefaultRendererLogLevels, Spinner} from 'listr2';
import {type AnyListrContext} from '../types/aliases.js';
import * as constants from './constants.js';

/**
 * Builds Listr options whose running tasks animate with a spinner.
 *
 * The default renderer only passes a spinner frame to tasks without subtasks; a running task that
 * still has subtasks (even hidden ones, as with collapsed one-shot tasks) gets a static pointer icon.
 * Supplying the renderer with a spinner instance and pointing the PENDING icon at it animates those
 * collapsed lines while completed/failed lines keep their normal icons.
 */
export class SpinnerListrOptions {
  /**
   * @param collapseTasks - when true, every task in the list renders as a single collapsed line
   *   (showSubtasks: false); when false, only the spinner icon override is applied.
   */
  public static build(collapseTasks: boolean = false): ListrBaseClassOptions<AnyListrContext, ListrRendererValue> {
    const spinner: Spinner = new Spinner();
    return {
      ...constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      rendererOptions: {
        ...constants.LISTR_DEFAULT_RENDERER_OPTION,
        ...(collapseTasks ? {showSubtasks: false} : {}),
        spinner,
        icon: {
          [ListrDefaultRendererLogLevels.PENDING]: (): string => spinner.fetch(),
        },
      },
    } as ListrBaseClassOptions<AnyListrContext, ListrRendererValue>;
  }
}
