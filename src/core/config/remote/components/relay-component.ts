// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentMetadata} from './component-metadata.js';
import {type NodeId} from '../../../../types/aliases.js';
import {type ToObject} from '../../../../types/index.js';
import {type RelayComponentStruct} from './interfaces/relay-component-struct.js';

export class RelayComponent extends BaseComponent implements RelayComponentStruct, ToObject<RelayComponentStruct> {
  public constructor(
    metadata: ComponentMetadata,
    public readonly consensusNodeIds: NodeId[] = [],
  ) {
    super(ComponentTypes.Relay, metadata);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: RelayComponentStruct): RelayComponent {
    return new RelayComponent(ComponentMetadata.fromObject(component.metadata), component.consensusNodeIds);
  }

  public override validate(): void {
    super.validate();

    for (const nodeId of this.consensusNodeIds) {
      if (typeof nodeId !== 'number' || nodeId < 0) {
        throw new SoloError(`Invalid consensus node id: ${nodeId}, aliases ${this.consensusNodeIds}`);
      }
    }
  }

  public override toObject(): RelayComponentStruct {
    return {
      consensusNodeIds: this.consensusNodeIds,
      ...super.toObject(),
    };
  }
}
