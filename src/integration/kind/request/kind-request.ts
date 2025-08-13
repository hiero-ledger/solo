// SPDX-License-Identifier: Apache-2.0

import {type KindExecutionBuilder} from '../execution/kind-execution-builder.js';

/**
 * Interface for Kind request parameters that can be applied to a KindExecutionBuilder.
 */
export interface KindRequest {
  /**
   * Applies this request's parameters to the given builder.
   * @param builder The builder to apply the parameters to
   */
  apply(builder: KindExecutionBuilder): void;
}
