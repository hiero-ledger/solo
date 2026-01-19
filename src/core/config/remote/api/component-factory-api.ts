// SPDX-License-Identifier: Apache-2.0

import {
  type ClusterReferenceName,
  type ComponentId,
  type PortForwardConfig,
  type PriorityMapping,
} from '../../../../types/index.js';
import {type NodeId} from '../../../../types/aliases.js';
import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ExplorerStateSchema} from '../../../../data/schema/model/remote/state/explorer-state-schema.js';
import {type MirrorNodeStateSchema} from '../../../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {type HaProxyStateSchema} from '../../../../data/schema/model/remote/state/ha-proxy-state-schema.js';
import {type EnvoyProxyStateSchema} from '../../../../data/schema/model/remote/state/envoy-proxy-state-schema.js';
import {type ConsensusNodeStateSchema} from '../../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type RelayNodeStateSchema} from '../../../../data/schema/model/remote/state/relay-node-state-schema.js';
import {type BlockNodeStateSchema} from '../../../../data/schema/model/remote/state/block-node-state-schema.js';

export interface ComponentFactoryApi {
  createNewRelayComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayNodeStateSchema;

  createNewExplorerComponent(clusterReference: ClusterReferenceName, namespace: NamespaceName): ExplorerStateSchema;

  createNewMirrorNodeComponent(clusterReference: ClusterReferenceName, namespace: NamespaceName): MirrorNodeStateSchema;

  createNewHaProxyComponent(clusterReference: ClusterReferenceName, namespace: NamespaceName): HaProxyStateSchema;

  createNewEnvoyProxyComponent(clusterReference: ClusterReferenceName, namespace: NamespaceName): EnvoyProxyStateSchema;

  createNewBlockNodeComponent(clusterReference: ClusterReferenceName, namespace: NamespaceName): BlockNodeStateSchema;

  createNewConsensusNodeComponent(
    id: ComponentId,
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
    portForwardConfigs?: PortForwardConfig[],
    blockNodeMap?: PriorityMapping[],
    externalBlockNodeIds?: number[],
  ): ConsensusNodeStateSchema;

  createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): ConsensusNodeStateSchema[];
}
