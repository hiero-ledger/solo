// SPDX-License-Identifier: Apache-2.0

import {Listr, type ListrBaseClassOptions} from 'listr2';
import {type SoloListrTask} from '../../../types/index.js';

/**
 * Represents a pipeline of tasks to be executed in sequence.
 */
export class OrchestratorPipeline<TContext> {
  public constructor(
    public readonly tasks: SoloListrTask<TContext>[],
    public readonly defaultOptions: ListrBaseClassOptions<TContext>,
  ) {}

  /**
   * Runs the pipeline of tasks with the provided options or default options if none are provided.
   * @param options
   */
  public async run(options?: ListrBaseClassOptions<TContext>): Promise<TContext> {
    return new Listr<TContext>(this.tasks, options ?? this.defaultOptions).run();
  }
}
