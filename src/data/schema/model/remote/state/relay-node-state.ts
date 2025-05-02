// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {type NodeId} from '../../../../../types/aliases.js';
import {ComponentStateMetadata} from './component-state-metadata.js';

@Exclude()
export class RelayNodeState {
  @Expose()
  public metadata: ComponentStateMetadata;

  @Expose()
  public consensusNodeIds: number[];

  public constructor(metadata?: ComponentStateMetadata, consensusNodeIds?: NodeId[]) {
    this.metadata = metadata;
    this.consensusNodeIds = consensusNodeIds;
  }
}
