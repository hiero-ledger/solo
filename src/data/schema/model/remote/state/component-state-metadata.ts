// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../../utils/transformations.js';
import {
  type ClusterReference,
  type ComponentId,
  type NamespaceNameAsString,
} from '../../../../../core/config/remote/types.js';
import {type DeploymentPhase} from '../deployment-phase.js';

@Exclude()
export class ComponentStateMetadata {
  @Expose()
  public id: ComponentId;

  @Expose()
  public namespace: NamespaceNameAsString;

  @Expose()
  public cluster: ClusterReference;

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;

  public constructor(
    id?: ComponentId,
    namespace?: NamespaceNameAsString,
    cluster?: ClusterReference,
    phase?: DeploymentPhase,
  ) {
    this.id = id;
    this.namespace = namespace;
    this.cluster = cluster;
    this.phase = phase;
  }
}
