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
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ClusterReference, type ComponentId} from '../../../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {type ComponentFactoryApi} from './api/component-factory-api.js';
import {type ComponentDataApi} from './api/component-data-api.js';
import {BlockNodeState} from '../../../data/schema/model/remote/state/block-node-state.js';

@injectable()
export class ComponentFactory implements ComponentFactoryApi {
  public constructor(@inject(InjectTokens.RemoteConfigManager) private readonly remoteConfig: ComponentDataApi) {
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigManager, this.constructor.name);
  }

  public createNewRelayComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayNodeState {
    const id: ComponentId = this.remoteConfig.getNewComponentId(ComponentTypes.RelayNodes);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new RelayNodeState(metadata, nodeIds);
  }

  public createNewExplorerComponent(clusterReference: ClusterReference, namespace: NamespaceName): ExplorerState {
    const id: ComponentId = this.remoteConfig.getNewComponentId(ComponentTypes.Explorers);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new ExplorerState(metadata);
  }

  public createNewMirrorNodeComponent(clusterReference: ClusterReference, namespace: NamespaceName): MirrorNodeState {
    const id: ComponentId = this.remoteConfig.getNewComponentId(ComponentTypes.MirrorNode);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new MirrorNodeState(metadata);
  }

  public createNewHaProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): HAProxyState {
    const id: ComponentId = this.remoteConfig.getNewComponentId(ComponentTypes.HaProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace.name, clusterReference, phase);

    return new HAProxyState(metadata);
  }

  public createNewEnvoyProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): EnvoyProxyState {
    const id: ComponentId = this.remoteConfig.getNewComponentId(ComponentTypes.EnvoyProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, clusterReference, namespace.name, phase);

    return new EnvoyProxyState(metadata);
  }

  public createNewBlockNodeComponent(clusterReference: ClusterReference, namespace: NamespaceName): BlockNodeState {
    const id: ComponentId = this.remoteConfig.getNewComponentId(ComponentTypes.BlockNode);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, clusterReference, namespace.name, phase);

    return new BlockNodeState(metadata);
  }

  public createNewConsensusNodeComponent(
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

  public createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ConsensusNodeState[] {
    return nodeIds.map(
      (nodeId: NodeId): ConsensusNodeState =>
        this.createNewConsensusNodeComponent(nodeId, clusterReference, namespace, DeploymentPhase.REQUESTED),
    );
  }
}
