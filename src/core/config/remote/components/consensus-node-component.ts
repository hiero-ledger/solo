// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentMetadata} from './component-metadata.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

/**
 * Represents a consensus node component within the system.
 *
 * A `ConsensusNodeComponent` extends the functionality of `BaseComponent` and includes additional properties and behaviors
 * specific to consensus nodes, such as maintaining and validating the node's state.
 */
export class ConsensusNodeComponent extends BaseComponent {
  public constructor(metadata: ComponentMetadata) {
    super(ComponentTypes.ConsensusNode, metadata);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStruct): ConsensusNodeComponent {
    return new ConsensusNodeComponent(ComponentMetadata.fromObject(component.metadata));
  }
}
