// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentMetadata} from './component-metadata.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

export class HaProxyComponent extends BaseComponent {
  public constructor(metadata: ComponentMetadata) {
    super(ComponentTypes.HaProxy, metadata);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStruct): HaProxyComponent {
    return new HaProxyComponent(ComponentMetadata.fromObject(component.metadata));
  }
}
