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
    return new RelayNodeState(this.getMetadata(ComponentTypes.RelayNodes, clusterReference, namespace), nodeIds);
  }

  public createNewExplorerComponent(clusterReference: ClusterReference, namespace: NamespaceName): ExplorerState {
    return new ExplorerState(this.getMetadata(ComponentTypes.Explorers, clusterReference, namespace));
  }

  public createNewMirrorNodeComponent(clusterReference: ClusterReference, namespace: NamespaceName): MirrorNodeState {
    return new MirrorNodeState(this.getMetadata(ComponentTypes.MirrorNode, clusterReference, namespace));
  }

  public createNewHaProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): HAProxyState {
    return new HAProxyState(this.getMetadata(ComponentTypes.HaProxy, clusterReference, namespace));
  }

  public createNewEnvoyProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): EnvoyProxyState {
    return new EnvoyProxyState(this.getMetadata(ComponentTypes.EnvoyProxy, clusterReference, namespace));
  }

  public createNewBlockNodeComponent(clusterReference: ClusterReference, namespace: NamespaceName): BlockNodeState {
    return new BlockNodeState(this.getMetadata(ComponentTypes.BlockNode, clusterReference, namespace));
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

  private getMetadata(
    componentType: ComponentTypes,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ComponentStateMetadata {
    const id: ComponentId = this.remoteConfig.getNewComponentId(componentType);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    return new ComponentStateMetadata(id, namespace.name, clusterReference, phase);
  }
}
