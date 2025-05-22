// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {ComponentStateMetadataSchema} from './component-state-metadata-schema.js';
import {BaseStateSchema} from './base-state-schema.js';
import {NodeId} from '../../../../../types/aliases.js';

@Exclude()
export class RelayNodeStateSchema extends BaseStateSchema {
  @Expose()
  public consensusNodeIds: number[];

  public constructor(metadata?: ComponentStateMetadataSchema, consensusNodeIds?: NodeId[]) {
    super(metadata);
    this.consensusNodeIds = consensusNodeIds;
  }
}
