// SPDX-License-Identifier: Apache-2.0

import {type KindExecutionBuilder} from '../execution/kind-execution-builder.js';

/**
 * Interface for options that can be applied to Kind commands.
 */
export interface Options {
  apply(builder: KindExecutionBuilder): void;
}
