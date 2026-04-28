// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';

interface RelayCommandInternal {
  prepareNetworkJsonString: (nodeAliases: string[], namespace: NamespaceName, deployment: string) => Promise<string>;
  prepareValuesArgForRelay: (configuration: Record<string, unknown>) => Promise<string>;
}

const createRelayConfig: (overrides?: Record<string, unknown>) => Record<string, unknown> = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  [flags.valuesFile.constName]: '',
  nodeAliases: ['node1'],
  [flags.chainId.constName]: '',
  [flags.relayReleaseTag.constName]: '',
  [flags.componentImage.constName]: '',
  [flags.replicaCount.constName]: 1,
  [flags.operatorId.constName]: '0.0.2',
  [flags.operatorKey.constName]: 'operator-key',
  [flags.namespace.constName]: NamespaceName.of('solo-e2e'),
  [flags.domainName.constName]: undefined,
  context: 'kind-solo-cluster',
  releaseName: 'relay-1',
  [flags.deployment.constName]: 'deployment',
  [flags.mirrorNamespace.constName]: 'solo-e2e',
  ...overrides,
});

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

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay(
      createRelayConfig({
        [flags.relayReleaseTag.constName]: '0.77.0',
      }),
    );

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

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay(
      createRelayConfig({
        [flags.componentImage.constName]: 'docker.io/library/v400.0',
      }),
    );

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

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay(
      createRelayConfig({
        [flags.componentImage.constName]: 'redis:7',
      }),
    );

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
      await relayCommandInternal.prepareValuesArgForRelay(
        createRelayConfig({
          [flags.componentImage.constName]: 'latest',
        }),
      );
      expect.fail('Expected prepareValuesArgForRelay to throw');
    } catch (error) {
      expect(error.message).to.include('Invalid image reference format: latest');
    }
  });
});
