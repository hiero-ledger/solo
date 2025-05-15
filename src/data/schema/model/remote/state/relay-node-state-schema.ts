// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {ComponentStateMetadata} from './component-state-metadata.js';
import {BaseState} from './base-state.js';
import {NodeId} from '../../../../../types/aliases.js';

@Exclude()
export class RelayNodeStateSchema extends BaseState {
  @Expose()
  public consensusNodeIds: number[];

  public constructor(metadata?: ComponentStateMetadata, consensusNodeIds?: NodeId[]) {
    super(metadata);
    this.consensusNodeIds = consensusNodeIds;
  }
}
