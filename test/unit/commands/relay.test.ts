// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../test-container.js';

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
    sinon
      // @ts-expect-error - to access private method
      .stub(relayCommand, 'prepareNetworkJsonString')
      .resolves('{"127.0.0.1:50211":"0.0.3"}');

    // @ts-expect-error - to access private method
    const valuesArgument: string = await relayCommand.prepareValuesArgForRelay({
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

    const relayReleaseTagFlag: string = '--set relay.image.tag=0.77.0';
    const relayImageTagFlag: string = '--set relay.image.tag=0.77.0-SNAPSHOT';
    expect(valuesArgument).to.include(relayReleaseTagFlag);
    expect(valuesArgument).to.include('--set ws.image.tag=0.77.0');
    expect(valuesArgument).to.include(relayImageTagFlag);
    expect(valuesArgument).to.include('--set ws.image.tag=0.77.0-SNAPSHOT');
    expect(valuesArgument.indexOf(relayReleaseTagFlag)).to.be.lessThan(valuesArgument.indexOf(relayImageTagFlag));
  });
});
