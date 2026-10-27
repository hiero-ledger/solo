// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {container} from 'tsyringe-neo';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import * as constants from '../../../../src/core/constants.js';
import {NodeStatusCodes} from '../../../../src/core/enumerations.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {NetworkNodeLifecycle} from '../../../../src/core/network-node-lifecycle.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

function createNodeCommandTasks(
  detectFatalContainerErrorStub: sinon.SinonStub,
  execContainerStub: sinon.SinonStub = sinon.stub().resolves(''),
  showUserStub: sinon.SinonStub = sinon.stub(),
): NodeCommandTasks {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (nodeCommandTasks as unknown as {logger: unknown}).logger = {
    debug: (): void => {},
    showUser: showUserStub,
  };

  (nodeCommandTasks as unknown as {remoteConfig: unknown}).remoteConfig = {
    getConsensusNodes: (): [] => [],
  };

  (nodeCommandTasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (): unknown => ({
      pods: (): {read: () => Promise<Pod>; detectFatalContainerError: sinon.SinonStub} => ({
        read: async (): Promise<Pod> => ({}) as unknown as Pod,
        detectFatalContainerError: detectFatalContainerErrorStub,
      }),
      containers: (): {readByRef: () => {execContainer: sinon.SinonStub}} => ({
        readByRef: (): {execContainer: sinon.SinonStub} => ({execContainer: execContainerStub}),
      }),
    }),
  };

  return nodeCommandTasks;
}

describe('NodeCommandTasks.checkNetworkNodeActiveness fast-fail on crashed container', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('fails fast once a fatal container error is detected repeatedly, without exhausting maxAttempts', async (): Promise<void> => {
    const getNetworkNodePodStatusStub: sinon.SinonStub = sinon
      .stub()
      .rejects(new Error('command terminated with exit code 137'));
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePodStatus: getNetworkNodePodStatusStub,
    } as never);

    const detectFatalContainerErrorStub: sinon.SinonStub = sinon
      .stub()
      .returns('container "root" was terminated due to: Error (exit code 135)');
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks(detectFatalContainerErrorStub);

    const maxAttempts: number = 50;
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('solo'),
        'node1',
        task,
        'Check network pod',
        NodeStatusCodes.ACTIVE,
        maxAttempts,
        0,
        1000,
        'kind-solo',
      );
      expect.fail('Expected checkNetworkNodeActiveness to throw');
    } catch (error: Error | unknown) {
      expect((error as Error).message).to.include('node1');
      expect((error as Error).message).to.include('crashed');
    }

    expect(getNetworkNodePodStatusStub.callCount).to.equal(constants.NETWORK_NODE_ACTIVE_FATAL_ERROR_THRESHOLD);
    expect(detectFatalContainerErrorStub.callCount).to.equal(constants.NETWORK_NODE_ACTIVE_FATAL_ERROR_THRESHOLD);
  });

  it('keeps retrying up to maxAttempts when no fatal container error is detected', async (): Promise<void> => {
    const getNetworkNodePodStatusStub: sinon.SinonStub = sinon.stub().rejects(new Error('transient exec error'));
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePodStatus: getNetworkNodePodStatusStub,
    } as never);

    const detectFatalContainerErrorStub: sinon.SinonStub = sinon.stub();
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks(detectFatalContainerErrorStub);

    const maxAttempts: number = 5;
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('solo'),
        'node1',
        task,
        'Check network pod',
        NodeStatusCodes.ACTIVE,
        maxAttempts,
        0,
        1000,
        'kind-solo',
      );
      expect.fail('Expected checkNetworkNodeActiveness to throw');
    } catch (error: Error | unknown) {
      expect((error as Error).message).to.include('node1');
    }

    expect(getNetworkNodePodStatusStub.callCount).to.equal(maxAttempts);
  });
});

describe('NodeCommandTasks.checkNetworkNodeActiveness diagnostics for a node that is not ready', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('prints the node logs and a JVM thread dump when the node never reaches the expected status', async (): Promise<void> => {
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePodStatus: sinon.stub().resolves(`platform_PlatformStatus ${NodeStatusCodes.FREEZING}.0`),
    } as never);

    const execContainerStub: sinon.SinonStub = sinon.stub().resolves('node diagnostics');
    const showUserStub: sinon.SinonStub = sinon.stub();
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks(sinon.stub(), execContainerStub, showUserStub);
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('solo'),
        'node1',
        task,
        'Check network pod',
        NodeStatusCodes.FREEZE_COMPLETE,
        2,
        0,
        1000,
        'kind-solo',
      );
      expect.fail('Expected checkNetworkNodeActiveness to throw');
    } catch (error: Error | unknown) {
      expect((error as Error).message).to.include('node1');
      expect((error as Error).message).to.include('FREEZE_COMPLETE');
    }

    expect(execContainerStub.calledOnce).to.equal(true);
    const [shell, option, script]: string[] = execContainerStub.firstCall.args[0];
    expect([shell, option]).to.deep.equal(['bash', '-c']);
    for (const logFile of ['swirlds.log', 'hgcaa.log']) {
      expect(script).to.contain(`tail -n 60 ${constants.HEDERA_HAPI_PATH}/output/${logFile}`);
    }
    expect(script).to.contain(NetworkNodeLifecycle.buildThreadDumpCommand());
    expect(script.endsWith('\ntrue')).to.equal(true);
    expect(showUserStub.calledOnceWith("Diagnostics for node 'node1' that is not ready:\nnode diagnostics")).to.equal(
      true,
    );
  });

  it('still reports the node as not ready when its diagnostics cannot be collected', async (): Promise<void> => {
    sinon.stub(container, 'resolve').returns({
      getNetworkNodePodStatus: sinon.stub().resolves(`platform_PlatformStatus ${NodeStatusCodes.FREEZING}.0`),
    } as never);

    const showUserStub: sinon.SinonStub = sinon.stub();
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasks(
      sinon.stub(),
      sinon.stub().rejects(new Error('container call failed')),
      showUserStub,
    );
    const task: SoloListrTaskWrapper<AnyListrContext> = {title: ''} as unknown as SoloListrTaskWrapper<AnyListrContext>;

    try {
      await nodeCommandTasks.checkNetworkNodeActiveness(
        NamespaceName.of('solo'),
        'node1',
        task,
        'Check network pod',
        NodeStatusCodes.FREEZE_COMPLETE,
        2,
        0,
        1000,
        'kind-solo',
      );
      expect.fail('Expected checkNetworkNodeActiveness to throw');
    } catch (error: Error | unknown) {
      expect((error as Error).message).to.include('FREEZE_COMPLETE');
    }

    expect(showUserStub.called).to.equal(false);
  });
});
