// SPDX-License-Identifier: Apache-2.0

import {type JsonString} from './aliases.js';

/**
 * Interface for converting class to JSON string.
 */
export interface ToJSON {
  /**
   * Converts the class instance to a plain JSON string.
   *
   * @returns the plain JSON string of the class.
   */
  toJSON(): JsonString;
}
