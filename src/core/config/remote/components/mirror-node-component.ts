// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentMetadata} from './component-metadata.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

export class MirrorNodeComponent extends BaseComponent {
  public constructor(metadata: ComponentMetadata) {
    super(ComponentTypes.MirrorNode, metadata);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStruct): MirrorNodeComponent {
    return new MirrorNodeComponent(ComponentMetadata.fromObject(component.metadata));
  }
}
