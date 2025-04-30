// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../../utils/transformations.js';
import {type DeploymentPhase} from '../deployment-phase.js';
import {
  type ClusterReference,
  type ComponentId,
  type NamespaceNameAsString,
} from '../../../../../core/config/remote/types.js';
import {type NodeId} from '../../../../../types/aliases.js';

@Exclude()
export class RelayNodeState {
  @Expose()
  public id: ComponentId;

  @Expose()
  public namespace: NamespaceNameAsString;

  @Expose()
  public cluster: ClusterReference;

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;

  @Expose()
  public consensusNodeIds: number[];

  public constructor(
    id?: ComponentId,
    namespace?: NamespaceNameAsString,
    cluster?: ClusterReference,
    phase?: DeploymentPhase,
    consensusNodeIds?: NodeId[],
  ) {
    this.id = id;
    this.namespace = namespace;
    this.cluster = cluster;
    this.phase = phase;
    this.consensusNodeIds = consensusNodeIds;
  }
}
