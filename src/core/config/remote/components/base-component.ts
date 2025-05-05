// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../enumerations/component-types.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

/**
 * Represents the base structure and common functionality for all components within the system.
 * This class provides validation, comparison, and serialization functionality for components.
 */
export class BaseComponent implements BaseComponentStruct {
  /**
   * @param type - type for identifying.
   * @param metadata
   */
  protected constructor(
    public readonly type: ComponentTypes,
    public readonly metadata: ComponentMetadata,
  ) {}

  /* -------- Utilities -------- */

  /**
   * Compares two BaseComponent instances for equality.
   *
   * @param x - The first component to compare
   * @param y - The second component to compare
   * @returns boolean - true if the components are equal
   */
  public static compare(x: BaseComponent, y: BaseComponent): boolean {
    return x.type === y.type && ComponentMetadata.compare(x.metadata, y.metadata);
  }
}
