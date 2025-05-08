// SPDX-License-Identifier: Apache-2.0

import {ComponentTypes} from './enumerations/component-types.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type NodeId} from '../../../types/aliases.js';
import {RelayNodeState} from '../../../data/schema/model/remote/state/relay-node-state.js';
import {ExplorerState} from '../../../data/schema/model/remote/state/explorer-state.js';
import {MirrorNodeState} from '../../../data/schema/model/remote/state/mirror-node-state.js';
import {HAProxyState} from '../../../data/schema/model/remote/state/haproxy-state.js';
import {EnvoyProxyState} from '../../../data/schema/model/remote/state/envoy-proxy-state.js';
import {ConsensusNodeState} from '../../../data/schema/model/remote/state/consensus-node-state.js';
import {ComponentStateMetadata} from '../../../data/schema/model/remote/state/component-state-metadata.js';
import {type RemoteConfigManager} from './remote-config-manager.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ClusterReference, type ComponentId} from '../../../types/index.js';

export class ComponentFactory {
  public static createNewRelayComponent(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayNodeState {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.RelayNodes);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new RelayNodeState(metadata, nodeIds);
  }

  public static createNewExplorerComponent(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ExplorerState {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.Explorers);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new ExplorerState(metadata);
  }

  public static createNewMirrorNodeComponent(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeState {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.MirrorNode);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new MirrorNodeState(metadata);
  }

  public static createNewHaProxyComponent(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): HAProxyState {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.HaProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new HAProxyState(metadata);
  }

  public static createNewEnvoyProxyComponent(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): EnvoyProxyState {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.EnvoyProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, clusterReference, namespace.name, phase);

    return new EnvoyProxyState(metadata);
  }

  public static createNewConsensusNodeComponent(
    nodeId: NodeId,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeState {
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(
      nodeId,
      namespace.name,
      clusterReference,
      phase,
    );

    return new ConsensusNodeState(metadata);
  }

  public static createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ConsensusNodeState[] {
    return nodeIds.map((nodeId: NodeId) =>
      ComponentFactory.createNewConsensusNodeComponent(nodeId, clusterReference, namespace, DeploymentPhase.REQUESTED),
    );
  }
}
