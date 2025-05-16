// SPDX-License-Identifier: Apache-2.0

import {ComponentTypes} from './enumerations/component-types.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type NodeId} from '../../../types/aliases.js';
import {ComponentStateMetadataSchema} from '../../../data/schema/model/remote/state/component-state-metadata-schema.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ClusterReference, type ComponentId} from '../../../types/index.js';
import {type RemoteConfigRuntimeStateApi} from '../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {type ComponentFactoryApi} from './api/component-factory-api.js';
import {RelayNodeStateSchema} from '../../../data/schema/model/remote/state/relay-node-state-schema.js';
import {ExplorerStateSchema} from '../../../data/schema/model/remote/state/explorer-state-schema.js';
import {MirrorNodeStateSchema} from '../../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {HAProxyStateSchema} from '../../../data/schema/model/remote/state/haproxy-state-schema.js';
import {EnvoyProxyStateSchema} from '../../../data/schema/model/remote/state/envoy-proxy-state-schema.js';
import {ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';

@injectable()
export class ComponentFactory implements ComponentFactoryApi {
  public constructor(
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
  ) {
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
  }

  public createNewRelayComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayNodeStateSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.RelayNodes);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
      namespace.name,
      clusterReference,
      phase,
    );

    return new RelayNodeStateSchema(metadata, nodeIds);
  }

  public createNewExplorerComponent(clusterReference: ClusterReference, namespace: NamespaceName): ExplorerStateSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.Explorers);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
      namespace.name,
      clusterReference,
      phase,
    );

    return new ExplorerStateSchema(metadata);
  }

  public createNewMirrorNodeComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeStateSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.MirrorNode);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
      namespace.name,
      clusterReference,
      phase,
    );

    return new MirrorNodeStateSchema(metadata);
  }

  public createNewHaProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): HAProxyStateSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.HaProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
      namespace.name,
      clusterReference,
      phase,
    );

    return new HAProxyStateSchema(metadata);
  }

  public createNewEnvoyProxyComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): EnvoyProxyStateSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.EnvoyProxy);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
      clusterReference,
      namespace.name,
      phase,
    );

    return new EnvoyProxyStateSchema(metadata);
  }

  public createNewConsensusNodeComponent(
    nodeId: NodeId,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeStateSchema {
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      nodeId,
      namespace.name,
      clusterReference,
      phase,
    );

    return new ConsensusNodeStateSchema(metadata);
  }

  public createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ConsensusNodeStateSchema[] {
    return nodeIds.map((nodeId: NodeId) =>
      this.createNewConsensusNodeComponent(nodeId, clusterReference, namespace, DeploymentPhase.REQUESTED),
    );
  }
}
