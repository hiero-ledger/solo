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

describe('RelayCommand unit tests', (): void => {
  let relayCommand: RelayCommand;

  beforeEach((): void => {
    resetForTest();
    relayCommand = container.resolve(RelayCommand);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should include imageTag in relay add and upgrade flags', (): void => {
    expect(RelayCommand.DEPLOY_FLAGS_LIST.optional).to.include(flags.imageTag);
    expect(RelayCommand.UPGRADE_FLAGS_LIST.optional).to.include(flags.imageTag);
  });

  it('should apply imageTag override after relayReleaseTag', async (): Promise<void> => {
    const relayCommandInternal: RelayCommandInternal = relayCommand as unknown as RelayCommandInternal;

    sinon.stub(relayCommandInternal, 'prepareNetworkJsonString').resolves('{"127.0.0.1:50211":"0.0.3"}');

    const valuesArgument: string = await relayCommandInternal.prepareValuesArgForRelay({
      valuesFile: '',
      nodeAliases: ['node1'],
      chainId: '',
      relayReleaseTag: '0.77.0',
      imageTag: '0.77.0-SNAPSHOT',
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

    expect(relayImageTagMatches).to.have.lengthOf(2);
    expect(relayImageTagMatches[0][1]).to.equal('0.77.0');
    expect(relayImageTagMatches[1][1]).to.equal('0.77.0-SNAPSHOT');
    expect(webSocketImageTagMatches).to.have.lengthOf(2);
    expect(webSocketImageTagMatches[0][1]).to.equal('0.77.0');
    expect(webSocketImageTagMatches[1][1]).to.equal('0.77.0-SNAPSHOT');
  });
});
