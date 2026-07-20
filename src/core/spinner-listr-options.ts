// SPDX-License-Identifier: Apache-2.0

import {type ListrBaseClassOptions, type ListrRendererValue} from 'listr2';
import {type AnyListrContext} from '../types/aliases.js';
import * as constants from './constants.js';

/**
 * Builds Listr options for the primary (append-only) renderer, optionally collapsing the list so that
 * each task renders as a single line without its subtasks.
 *
 * Note: this previously injected an animated spinner for the built-in `default` renderer's pending line.
 * The primary renderer (SoloListrRenderer) manages its own spinner and per-parent windowing, so only
 * the collapse behaviour remains here.
 */
export class SpinnerListrOptions {
  /**
   * @param collapseTasks - when true, subtasks are hidden (showSubtasks: false) so each task in the list
   *   renders as a single collapsed line; when false, the default options are returned unchanged.
   */
  public static build(collapseTasks: boolean = false): ListrBaseClassOptions<AnyListrContext, ListrRendererValue> {
    return {
      ...constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      rendererOptions: {
        ...constants.LISTR_DEFAULT_RENDERER_OPTION,
        ...(collapseTasks ? {showSubtasks: false} : {}),
      },
    } as ListrBaseClassOptions<AnyListrContext, ListrRendererValue>;
  }
}
