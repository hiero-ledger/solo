// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for capsuling validating for class's own properties
 */
export interface Validate {
  /**
   * Validates all properties of the class and throws if data is invalid
   */
  validate(): void;
}
