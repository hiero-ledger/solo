// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTask} from '../../../types/index.js';

export interface OrchestratorStep<TConfig, TContext> {
  asListrTask(config: TConfig): SoloListrTask<TContext>;
}
