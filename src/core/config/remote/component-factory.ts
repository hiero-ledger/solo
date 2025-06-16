// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';

import {ComponentTypes} from './enumerations/component-types.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type NodeId} from '../../../types/aliases.js';
import {type ClusterReference, type ComponentId} from '../../../types/index.js';
import {type RemoteConfigRuntimeStateApi} from '../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type ComponentFactoryApi} from './api/component-factory-api.js';
import {ComponentStateMetadataSchema} from '../../../data/schema/model/remote/state/component-state-metadata-schema.js';
import {RelayNodeStateSchema} from '../../../data/schema/model/remote/state/relay-node-state-schema.js';
import {ExplorerStateSchema} from '../../../data/schema/model/remote/state/explorer-state-schema.js';
import {MirrorNodeStateSchema} from '../../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {HaProxyStateSchema} from '../../../data/schema/model/remote/state/ha-proxy-state-schema.js';
import {EnvoyProxyStateSchema} from '../../../data/schema/model/remote/state/envoy-proxy-state-schema.js';
import {ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {BlockNodeStateSchema} from '../../../data/schema/model/remote/state/block-node-state-schema.js';
import {Templates} from '../../templates.js';

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
    return new RelayNodeStateSchema(this.getMetadata(ComponentTypes.RelayNodes, clusterReference, namespace), nodeIds);
  }

  public createNewExplorerComponent(clusterReference: ClusterReference, namespace: NamespaceName): ExplorerStateSchema {
    return new ExplorerStateSchema(this.getMetadata(ComponentTypes.Explorer, clusterReference, namespace));
  }

  public createNewMirrorNodeComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeStateSchema {
    return new MirrorNodeStateSchema(this.getMetadata(ComponentTypes.MirrorNode, clusterReference, namespace));
  }

  public createNewHaProxyComponent(clusterReference: ClusterReference, namespace: NamespaceName): HaProxyStateSchema {
    return new HaProxyStateSchema(this.getMetadata(ComponentTypes.HaProxy, clusterReference, namespace));
  }

  public createNewEnvoyProxyComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): EnvoyProxyStateSchema {
    return new EnvoyProxyStateSchema(this.getMetadata(ComponentTypes.EnvoyProxy, clusterReference, namespace));
  }

  public createNewBlockNodeComponent(
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): BlockNodeStateSchema {
    return new BlockNodeStateSchema(this.getMetadata(ComponentTypes.BlockNode, clusterReference, namespace));
  }

  public createNewConsensusNodeComponent(
    id: ComponentId,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeStateSchema {
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
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
    return nodeIds.map(
      (nodeId: NodeId): ConsensusNodeStateSchema =>
        this.createNewConsensusNodeComponent(
          Templates.renderComponentIdFromNodeId(nodeId),
          clusterReference,
          namespace,
          DeploymentPhase.REQUESTED,
        ),
    );
  }

  private getMetadata(
    componentType: ComponentTypes,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ComponentStateMetadataSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(componentType);
    const phase: DeploymentPhase.DEPLOYED = DeploymentPhase.DEPLOYED;
    return new ComponentStateMetadataSchema(id, namespace.name, clusterReference, phase);
  }
}
