// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {BaseStateSchema} from './base-state-schema.js';
import {ComponentStateMetadataSchema} from './component-state-metadata-schema.js';

@Exclude()
export class ConsensusNodeStateSchema extends BaseStateSchema {
  @Expose()
  public blockNodeIds: number[];

  @Expose()
  public externalBlockNodeIds: number[];

  public constructor(
    metadata?: ComponentStateMetadataSchema,
    blockNodeIds?: number[],
    externalBlockNodeIds?: number[],
  ) {
    super(metadata);
    this.blockNodeIds = blockNodeIds || [];
    this.externalBlockNodeIds = externalBlockNodeIds || [];
  }
}
