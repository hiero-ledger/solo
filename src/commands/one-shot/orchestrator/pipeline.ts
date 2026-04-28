// SPDX-License-Identifier: Apache-2.0

import {Listr, type ListrBaseClassOptions} from 'listr2';
import {type SoloListrTask} from '../../../types/index.js';

export class Pipeline<TContext> {
  public constructor(
    public readonly tasks: SoloListrTask<TContext>[],
    private readonly defaultOptions: ListrBaseClassOptions<TContext>,
  ) {}

  public async run(options?: ListrBaseClassOptions<TContext>): Promise<TContext> {
    return new Listr<TContext>(this.tasks, options ?? this.defaultOptions).run();
  }
}
