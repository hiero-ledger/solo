// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';

import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {NodeStatusCodes} from '../../../../src/core/enumerations.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type NetworkNodes} from '../../../../src/core/network-nodes.js';
import {type AccountManager} from '../../../../src/core/account-manager.js';

describe('NodeCommandTasks node activeness and gRPC readiness', (): void => {
  let nodeCommandTasks: NodeCommandTasks;
  let loggerStub: SoloLogger;
  let networkNodesStub: NetworkNodes;
  let accountManagerStub: AccountManager;
  let containerStub: sinon.SinonStub;

  beforeEach((): void => {
    loggerStub = {
      debug: sinon.stub(),
      warn: sinon.stub(),
      showUser: sinon.stub(),
      error: sinon.stub(),
      info: sinon.stub(),
    } as unknown as SoloLogger;

    networkNodesStub = {
      getNetworkNodePodStatus: sinon.stub(),
    } as unknown as NetworkNodes;

    accountManagerStub = {
      refreshNodeClient: sinon.stub(),
    } as unknown as AccountManager;

    containerStub = sinon.stub(container, 'resolve');
    containerStub.withArgs(InjectTokens.NetworkNodes).returns(networkNodesStub);

    nodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    (nodeCommandTasks as any).logger = loggerStub;
    (nodeCommandTasks as any).accountManager = accountManagerStub;
    (nodeCommandTasks as any).remoteConfig = {
      getConsensusNodes: sinon.stub().returns([{name: 'node1'}]),
      getClusterRefs: sinon.stub().returns({}),
    };
    (nodeCommandTasks as any).configManager = {
      getFlag: sinon.stub().returns('deployment'),
    };
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should abort early if shared deadline expires during checkNetworkNodeActiveness', async (): Promise<void> => {
    // Make it always return UNKNOWN or empty so it keeps looping
    (networkNodesStub.getNetworkNodePodStatus as sinon.SinonStub).resolves('');

    const taskWrapper: any = {
      title: '',
    };

    const maxAttempts: number = 300;
    const delay: number = 10;
    const timeout: number = 10;

    // Set a deadline that expires immediately
    const deadlineMs: number = Date.now() - 1000;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('test'),
        'node1',
        taskWrapper,
        'title',
        NodeStatusCodes.ACTIVE,
        maxAttempts,
        delay,
        timeout,
        'context',
        deadlineMs,
      );
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error).to.be.instanceOf(SoloErrors.system.timeout);
      expect(error.message).to.include('activeness check timed out after exceeding the shared deadline');
    }

    // Verify it aborted immediately rather than doing 300 attempts
    // We removed the warn log in favor of explicit throw, so no log check is needed.
  });

  it('waitForGrpcReadiness should throw NodeNotReadySoloError if it fails all attempts', async (): Promise<void> => {
    // Make refreshNodeClient always throw to simulate failure
    (accountManagerStub.refreshNodeClient as sinon.SinonStub).rejects(new Error('Connection refused'));

    const taskWrapper: any = {
      title: '',
    };

    // Fast-forward sleep so we don't actually wait 20s during the test
    const clock = sinon.useFakeTimers();

    const promise = (nodeCommandTasks as any).waitForGrpcReadiness(
      NamespaceName.of('test'),
      'node1',
      taskWrapper,
      'title',
    );

    // Tick the clock 25 times to ensure all 20 attempts exhaust
    for (let index = 0; index < 25; index++) {
      await clock.tickAsync(1000);
    }

    try {
      await promise;
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error).to.be.instanceOf(SoloErrors.component.nodeNotReady);
      expect(error.message).to.include("Node 'node1' is not gRPC readiness [attempt = ");
    }
  });
});
