// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {BaseStateSchema} from './base-state-schema.js';
import {ComponentStateMetadataSchema} from './component-state-metadata-schema.js';
import {PriorityMapping} from '../../../../../types/index.js';

@Exclude()
export class ConsensusNodeStateSchema extends BaseStateSchema {
  @Expose()
  public blockNodeMap: PriorityMapping[];

  public constructor(metadata?: ComponentStateMetadataSchema, blockNodeMap?: PriorityMapping[]) {
    super(metadata);
    this.blockNodeMap = blockNodeMap || [];
  }
}
