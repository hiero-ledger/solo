// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTask} from '../../../types/index.js';

/**
 * Represents a step in the orchestrator pipeline.
 * Each step is responsible for creating a Listr task that will be executed as part of the pipeline.
 */
export interface OrchestratorStep<TConfig, TContext> {
  /**
   * Creates a Listr task for this step using the provided configuration.
   * @param getConfig
   */
  asListrTask(getConfig: () => TConfig): SoloListrTask<TContext>;
}
