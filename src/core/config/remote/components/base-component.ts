// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentMetadata} from './component-metadata.js';
import {isValidEnum} from '../../../util/validation-helpers.js';
import {type ToObject, type Validate} from '../../../../types/index.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';

/**
 * Represents the base structure and common functionality for all components within the system.
 * This class provides validation, comparison, and serialization functionality for components.
 */
export class BaseComponent implements BaseComponentStruct, Validate, ToObject<BaseComponentStruct> {
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

  public get phase(): DeploymentPhase {
    return this.metadata.phase;
  }

  public set phase(phase: DeploymentPhase) {
    this.metadata.phase = phase;
    this.validate();
  }

  public validate(): void {
    this.metadata.validate();

    if (!isValidEnum(this.type, ComponentTypes)) {
      throw new SoloError(`Invalid component type: ${this.type}`);
    }
  }

  public toObject(): BaseComponentStruct {
    return {
      metadata: this.metadata.toObject(),
    };
  }
}
