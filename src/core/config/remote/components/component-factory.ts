// SPDX-License-Identifier: Apache-2.0

import {ComponentTypes} from '../enumerations/component-types.js';
import {RelayComponent} from './relay-component.js';
import {MirrorNodeExplorerComponent} from './mirror-node-explorer-component.js';
import {MirrorNodeComponent} from './mirror-node-component.js';
import {HaProxyComponent} from './ha-proxy-component.js';
import {EnvoyProxyComponent} from './envoy-proxy-component.js';
import {ConsensusNodeComponent} from './consensus-node-component.js';
import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type RemoteConfigManagerApi} from '../api/remote-config-manager-api.js';
import {type ClusterReference, type ComponentId} from '../types.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeId} from '../../../../types/aliases.js';

export class ComponentFactory {
  public static createNewRelayComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.RelayNodes);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentMetadata = new ComponentMetadata(id, clusterReference, namespace.name, phase);

    return new RelayComponent(metadata, nodeIds);
  }

  public static createNewExplorerComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeExplorerComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.Explorers);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentMetadata = new ComponentMetadata(id, clusterReference, namespace.name, phase);

    return new MirrorNodeExplorerComponent(metadata);
  }

  public static createNewMirrorNodeComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.MirrorNode);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentMetadata = new ComponentMetadata(id, clusterReference, namespace.name, phase);

    return new MirrorNodeComponent(metadata);
  }

  public static createNewHaProxyComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): HaProxyComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.HaProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentMetadata = new ComponentMetadata(id, clusterReference, namespace.name, phase);

    return new HaProxyComponent(metadata);
  }

  public static createNewEnvoyProxyComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): EnvoyProxyComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.EnvoyProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentMetadata = new ComponentMetadata(id, clusterReference, namespace.name, phase);

    return new EnvoyProxyComponent(metadata);
  }

  public static createNewConsensusNodeComponent(
    nodeId: NodeId,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeComponent {
    const metadata: ComponentMetadata = new ComponentMetadata(nodeId, clusterReference, namespace.name, phase);

    return new ConsensusNodeComponent(metadata);
  }

  public static createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): Record<ComponentId, ConsensusNodeComponent> {
    const consensusNodeComponents: Record<ComponentId, ConsensusNodeComponent> = {};

    for (const nodeId of nodeIds) {
      consensusNodeComponents[nodeId] = ComponentFactory.createNewConsensusNodeComponent(
        nodeId,
        clusterReference,
        namespace,
        DeploymentPhase.REQUESTED,
      );
    }

    return consensusNodeComponents;
  }
}
