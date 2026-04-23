// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {RelayCommand} from '../../../src/commands/relay.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';

interface RelayCommandInternal {
  prepareNetworkJsonString: (nodeAliases: string[], namespace: NamespaceName, deployment: string) => Promise<string>;
  prepareValuesArgForRelay: (configuration: Record<string, unknown>) => Promise<string>;
}

describe('RelayCommand unit tests', (): void => {
  let relayCommand: RelayCommand;

  beforeEach((): void => {
    resetForTest();
    relayCommand = container.resolve(RelayCommand);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should apply relayReleaseTag to relay and ws image tags', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay({
      valuesFile: '',
      nodeAliases: ['node1'],
      chainId: '',
      relayReleaseTag: '0.77.0',
      componentImage: '',
      replicaCount: 1,
      operatorId: '0.0.2',
      operatorKey: 'operator-key',
      namespace: NamespaceName.of('solo-e2e'),
      domainName: undefined,
      context: 'kind-solo-cluster',
      releaseName: 'relay-1',
      deployment: 'deployment',
      mirrorNamespace: 'solo-e2e',
    });

    const relayImageTagMatches: RegExpMatchArray[] = [...valuesArgument.matchAll(/--set relay\.image\.tag=([^\s]+)/g)];
    const webSocketImageTagMatches: RegExpMatchArray[] = [...valuesArgument.matchAll(/--set ws\.image\.tag=([^\s]+)/g)];

    expect(relayImageTagMatches).to.have.lengthOf(1);
    expect(relayImageTagMatches[0][1]).to.equal('0.77.0');
    expect(webSocketImageTagMatches).to.have.lengthOf(1);
    expect(webSocketImageTagMatches[0][1]).to.equal('0.77.0');
  });

  it('should accept full relay image reference and set relay/ws image registry repository and tag', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay({
      valuesFile: '',
      nodeAliases: ['node1'],
      chainId: '',
      relayReleaseTag: '',
      componentImage: 'docker.io/library/v400.0',
      replicaCount: 1,
      operatorId: '0.0.2',
      operatorKey: 'operator-key',
      namespace: NamespaceName.of('solo-e2e'),
      domainName: undefined,
      context: 'kind-solo-cluster',
      releaseName: 'relay-1',
      deployment: 'deployment',
      mirrorNamespace: 'solo-e2e',
    });

    expect(valuesArgument).to.include('--set relay.image.registry=docker.io');
    expect(valuesArgument).to.include('--set ws.image.registry=docker.io');
    expect(valuesArgument).to.include('--set relay.image.repository=library/v400.0');
    expect(valuesArgument).to.include('--set ws.image.repository=library/v400.0');
    expect(valuesArgument).to.include('--set relay.image.tag=latest');
    expect(valuesArgument).to.include('--set ws.image.tag=latest');
  });

  it('should accept docker hub shorthand and infer docker.io/library repository', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay({
      valuesFile: '',
      nodeAliases: ['node1'],
      chainId: '',
      relayReleaseTag: '',
      componentImage: 'redis:7',
      replicaCount: 1,
      operatorId: '0.0.2',
      operatorKey: 'operator-key',
      namespace: NamespaceName.of('solo-e2e'),
      domainName: undefined,
      context: 'kind-solo-cluster',
      releaseName: 'relay-1',
      deployment: 'deployment',
      mirrorNamespace: 'solo-e2e',
    });

    expect(valuesArgument).to.include('--set relay.image.registry=docker.io');
    expect(valuesArgument).to.include('--set ws.image.registry=docker.io');
    expect(valuesArgument).to.include('--set relay.image.repository=library/redis');
    expect(valuesArgument).to.include('--set ws.image.repository=library/redis');
    expect(valuesArgument).to.include('--set relay.image.tag=7');
    expect(valuesArgument).to.include('--set ws.image.tag=7');
  });

  it('should reject plain tag value for componentImage', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    try {
      await relayCommandInternal.prepareValuesArgForRelay({
        valuesFile: '',
        nodeAliases: ['node1'],
        chainId: '',
        relayReleaseTag: '',
        componentImage: 'latest',
        replicaCount: 1,
        operatorId: '0.0.2',
        operatorKey: 'operator-key',
        namespace: NamespaceName.of('solo-e2e'),
        domainName: undefined,
        context: 'kind-solo-cluster',
        releaseName: 'relay-1',
        deployment: 'deployment',
        mirrorNamespace: 'solo-e2e',
      });
      expect.fail('Expected prepareValuesArgForRelay to throw');
    } catch (error) {
      expect(error.message).to.include('Invalid image reference: latest');
    }
  });
});
