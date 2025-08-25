// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../../utils/transformations.js';
import {type DeploymentPhase} from '../deployment-phase.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type NamespaceNameAsString,
  portForwardConfig,
} from '../../../../../types/index.js';

@Exclude()
export class ComponentStateMetadataSchema {
  @Expose()
  public id: ComponentId;

  @Expose()
  public namespace: NamespaceNameAsString;

  @Expose()
  public cluster: ClusterReferenceName;

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;

  @Expose()
  public portForwardConfigs: portForwardConfig[];

  public constructor(
    id?: ComponentId,
    namespace?: NamespaceNameAsString,
    cluster?: ClusterReferenceName,
    phase?: DeploymentPhase,
    portForwardConfigs?: portForwardConfig[],
  ) {
    this.id = id;
    this.namespace = namespace;
    this.cluster = cluster;
    this.phase = phase;
    this.portForwardConfigs = portForwardConfigs;
  }
}
