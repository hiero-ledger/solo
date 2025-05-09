// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ComponentsDataWrapper} from '../../../../../src/core/config/remote/components-data-wrapper.js';
import {SoloError} from '../../../../../src/core/errors/solo-error.js';
import {ComponentTypes} from '../../../../../src/core/config/remote/enumerations/component-types.js';
import {type NodeId} from '../../../../../src/types/aliases.js';
import {type ClusterReference, type ComponentId, type NamespaceNameAsString} from '../../../../../src/types/index.js';
import {DeploymentPhase} from '../../../../../src/data/schema/model/remote/deployment-phase.js';
import {RelayNodeState} from '../../../../../src/data/schema/model/remote/state/relay-node-state.js';
import {HAProxyState} from '../../../../../src/data/schema/model/remote/state/haproxy-state.js';
import {MirrorNodeState} from '../../../../../src/data/schema/model/remote/state/mirror-node-state.js';
import {EnvoyProxyState} from '../../../../../src/data/schema/model/remote/state/envoy-proxy-state.js';
import {ConsensusNodeState} from '../../../../../src/data/schema/model/remote/state/consensus-node-state.js';
import {ExplorerState} from '../../../../../src/data/schema/model/remote/state/explorer-state.js';
import {ComponentStateMetadata} from '../../../../../src/data/schema/model/remote/state/component-state-metadata.js';
import {RemoteConfig} from '../../../../../src/data/schema/model/remote/remote-config.js';
import {DeploymentState} from '../../../../../src/data/schema/model/remote/deployment-state.js';
import {LedgerPhase} from '../../../../../src/data/schema/model/remote/ledger-phase.js';
import {BlockNodeState} from '../../../../../src/data/schema/model/remote/state/block-node-state.js';
import {type ComponentsDataWrapperApi} from '../../../../../src/core/config/remote/api/components-data-wrapper-api.js';

export function createComponentsDataWrapper(): {
  values: {
    id: ComponentId;
    cluster: ClusterReference;
    namespace: NamespaceNameAsString;
    phase: DeploymentPhase.DEPLOYED;
    consensusNodeIds: NodeId[];
  };
  components: {
    relays: RelayNodeState[];
    haProxies: HAProxyState[];
    mirrorNodes: MirrorNodeState[];
    envoyProxies: EnvoyProxyState[];
    consensusNodes: ConsensusNodeState[];
    explorers: ExplorerState[];
    blockNodes: BlockNodeState[];
  };
  wrapper: {componentsDataWrapper: ComponentsDataWrapperApi};
  componentId: ComponentId;
} {
  const id: ComponentId = 0;
  const componentId: ComponentId = id;

  const cluster: ClusterReference = 'cluster';
  const namespace: NamespaceNameAsString = 'namespace';
  const phase: DeploymentPhase = DeploymentPhase.DEPLOYED;
  const consensusNodeIds: NodeId[] = [0, 1];

  const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace, cluster, phase);

  const relays: RelayNodeState[] = [new RelayNodeState(metadata, consensusNodeIds)];
  const haProxies: HAProxyState[] = [new HAProxyState(metadata)];
  const mirrorNodes: MirrorNodeState[] = [new MirrorNodeState(metadata)];
  const envoyProxies: EnvoyProxyState[] = [new EnvoyProxyState(metadata)];
  const consensusNodes: ConsensusNodeState[] = [new ConsensusNodeState(metadata)];
  const explorers: ExplorerState[] = [new ExplorerState(metadata)];
  const blockNodes: BlockNodeState[] = [new BlockNodeState(metadata)];

  const deploymentState: DeploymentState = new DeploymentState(
    LedgerPhase.INITIALIZED,
    consensusNodes,
    blockNodes,
    mirrorNodes,
    relays,
    haProxies,
    envoyProxies,
    explorers,
  );

  const remoteConfig: RemoteConfig = new RemoteConfig(undefined, undefined, undefined, undefined, deploymentState);

  // @ts-expect-error - to mock
  const componentsDataWrapper: ComponentsDataWrapperApi = new ComponentsDataWrapper({state: remoteConfig.state});

  return {
    values: {id, cluster, namespace, phase, consensusNodeIds},
    components: {consensusNodes, haProxies, envoyProxies, mirrorNodes, explorers, relays, blockNodes},
    wrapper: {componentsDataWrapper},
    componentId,
  };
}

describe('ComponentsDataWrapper', () => {
  it('should be able to create a instance', () => createComponentsDataWrapper());

  it('should not be able to add new component with the .addNewComponent() method if it already exist', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {consensusNodes},
    } = createComponentsDataWrapper();

    const existingComponent: ConsensusNodeState = consensusNodes[0];

    expect(() => componentsDataWrapper.addNewComponent(existingComponent, ComponentTypes.ConsensusNode)).to.throw(
      SoloError,
      'Component exists',
    );
  });

  it('should be able to add new component with the .addNewComponent() method', () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newComponentId: ComponentId = 1;
    const {id, cluster, namespace, phase} = {
      id: newComponentId,
      cluster: 'cluster',
      namespace: 'new-namespace',
      phase: DeploymentPhase.DEPLOYED,
    };

    const metadata: ComponentStateMetadata = new ComponentStateMetadata(id, namespace, cluster, phase);
    const newComponent: EnvoyProxyState = new EnvoyProxyState(metadata);

    componentsDataWrapper.addNewComponent(newComponent, ComponentTypes.EnvoyProxy);

    expect(componentsDataWrapper.state.envoyProxies).to.have.lengthOf(2);
  });

  it('should be able to change node state with the .changeNodeState(()', () => {
    const {
      wrapper: {componentsDataWrapper},
      componentId,
    } = createComponentsDataWrapper();

    const newNodeState: DeploymentPhase = DeploymentPhase.STOPPED;

    componentsDataWrapper.changeNodePhase(componentId, newNodeState);

    expect(componentsDataWrapper.state.consensusNodes[0].metadata.phase).to.equal(newNodeState);
  });

  it("should not be able to edit component with the .editComponent() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();
    const notFoundComponentId: ComponentId = 9;

    expect(() => componentsDataWrapper.changeNodePhase(notFoundComponentId, DeploymentPhase.FROZEN)).to.throw(
      SoloError,
      `Consensus node ${notFoundComponentId} doesn't exist`,
    );
  });

  it('should be able to remove component with the .removeComponent()', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      componentId,
    } = createComponentsDataWrapper();

    componentsDataWrapper.removeComponent(componentId, ComponentTypes.RelayNodes);

    expect(relays).to.not.have.own.property(componentId.toString());
  });

  it("should not be able to remove component with the .removeComponent() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentId: ComponentId = 9;

    expect(() => componentsDataWrapper.removeComponent(notFoundComponentId, ComponentTypes.RelayNodes)).to.throw(
      SoloError,
      `Component ${notFoundComponentId} of type ${ComponentTypes.RelayNodes} not found while attempting to remove`,
    );
  });

  it('should be able to get components with .getComponent()', () => {
    const {
      wrapper: {componentsDataWrapper},
      componentId,
      components: {mirrorNodes},
    } = createComponentsDataWrapper();

    const mirrorNodeComponent: MirrorNodeState = componentsDataWrapper.getComponent<MirrorNodeState>(
      ComponentTypes.MirrorNode,
      componentId,
    );

    expect(mirrorNodes[componentId].metadata.id).to.deep.equal(mirrorNodeComponent.metadata.id);
  });

  it("should fail if trying to get component that doesn't exist with .getComponent()", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentId: ComponentId = 9;
    const type: ComponentTypes = ComponentTypes.MirrorNode;

    expect(() => componentsDataWrapper.getComponent<MirrorNodeState>(type, notFoundComponentId)).to.throw(
      `Component ${notFoundComponentId} of type ${type} not found while attempting to read`,
    );
  });
});
