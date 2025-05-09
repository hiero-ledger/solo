// SPDX-License-Identifier: Apache-2.0

import {type ClusterReference} from '../../../../types/index.js';
import {type NodeId} from '../../../../types/aliases.js';
import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type RelayNodeState} from '../../../../data/schema/model/remote/state/relay-node-state.js';
import {type ExplorerState} from '../../../../data/schema/model/remote/state/explorer-state.js';
import {type MirrorNodeState} from '../../../../data/schema/model/remote/state/mirror-node-state.js';
import {type HAProxyState} from '../../../../data/schema/model/remote/state/haproxy-state.js';
import {type EnvoyProxyState} from '../../../../data/schema/model/remote/state/envoy-proxy-state.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ConsensusNodeState} from '../../../../data/schema/model/remote/state/consensus-node-state.js';

export interface ComponentFactoryApi {
  createNewRelayComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayNodeState;

  createNewExplorerComponent(clusterReference: ClusterReference, namespace: NamespaceName): ExplorerState;

  createNewMirrorNodeComponent(clusterReference: ClusterReference, namespace: NamespaceName): MirrorNodeState;

  createNewHaProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): HAProxyState;

  createNewEnvoyProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): EnvoyProxyState;

  createNewConsensusNodeComponent(
    nodeId: NodeId,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeState;

  createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ConsensusNodeState[];
}
