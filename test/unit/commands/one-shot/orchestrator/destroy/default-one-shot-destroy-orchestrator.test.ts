// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DefaultOneShotDestroyOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/destroy/default-one-shot-destroy-orchestrator.js';
import {type DestroyExplorerStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/destroy-explorer-step.js';
import {type DestroyRelayStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/destroy-relay-step.js';
import {type DestroyMirrorNodeStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/destroy-mirror-node-step.js';
import {type DestroyBlockNodeStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/destroy-block-node-step.js';
import {type DestroyConsensusNodeStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/destroy-consensus-node-step.js';
import {type ClusterResetStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/cluster-reset-step.js';
import {type ClusterDisconnectStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/cluster-disconnect-step.js';
import {type DeploymentDeleteStep} from '../../../../../../src/commands/one-shot/orchestrator/destroy/deployment-delete-step.js';
import {type SoloEventBus} from '../../../../../../src/core/events/solo-event-bus.js';
import {type OneShotSingleDestroyConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../../../../../src/commands/one-shot/one-shot-single-destroy-context.js';
import {type SoloListrTaskWrapper} from '../../../../../../src/types/index.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';

function makeConfig(overrides: Partial<OneShotSingleDestroyConfigClass> = {}): OneShotSingleDestroyConfigClass {
  return {
    deployment: 'test-deployment',
    namespace: NamespaceName.of('test-ns'),
    clusterRef: 'test-cluster',
    context: 'test-context',
    cacheDir: '/tmp/cache',
    skipAll: false,
    hasExplorers: true,
    hasRelays: true,
    hasMirrorNodes: true,
    hasBlockNodes: true,
    ...overrides,
  } as OneShotSingleDestroyConfigClass;
}

describe('DefaultOneShotDestroyOrchestrator', (): void => {
  let orchestrator: DefaultOneShotDestroyOrchestrator;
  let destroyExplorerStepStub: DestroyExplorerStep;
  let destroyRelayStepStub: DestroyRelayStep;
  let destroyMirrorNodeStepStub: DestroyMirrorNodeStep;
  let destroyBlockNodeStepStub: DestroyBlockNodeStep;
  let destroyConsensusNodeStepStub: DestroyConsensusNodeStep;
  let clusterResetStepStub: ClusterResetStep;
  let clusterDisconnectStepStub: ClusterDisconnectStep;
  let deploymentDeleteStepStub: DeploymentDeleteStep;
  let eventBusStub: SoloEventBus;

  beforeEach((): void => {
    destroyExplorerStepStub = {
      asListrTask: sinon.stub().returns({title: 'destroy-explorer-task'}),
    } as unknown as DestroyExplorerStep;
    destroyRelayStepStub = {
      asListrTask: sinon.stub().returns({title: 'destroy-relay-task'}),
    } as unknown as DestroyRelayStep;
    destroyMirrorNodeStepStub = {
      asListrTask: sinon.stub().returns({title: 'destroy-mirror-task'}),
    } as unknown as DestroyMirrorNodeStep;
    destroyBlockNodeStepStub = {
      asListrTask: sinon.stub().returns({title: 'destroy-block-task'}),
    } as unknown as DestroyBlockNodeStep;
    destroyConsensusNodeStepStub = {
      asListrTask: sinon.stub().returns({title: 'destroy-consensus-task'}),
    } as unknown as DestroyConsensusNodeStep;
    clusterResetStepStub = {
      asListrTask: sinon.stub().returns({title: 'cluster-reset-task'}),
    } as unknown as ClusterResetStep;
    clusterDisconnectStepStub = {
      asListrTask: sinon.stub().returns({title: 'cluster-disconnect-task'}),
    } as unknown as ClusterDisconnectStep;
    deploymentDeleteStepStub = {
      asListrTask: sinon.stub().returns({title: 'deployment-delete-task'}),
    } as unknown as DeploymentDeleteStep;
    eventBusStub = {waitFor: sinon.stub()} as unknown as SoloEventBus;

    orchestrator = new DefaultOneShotDestroyOrchestrator(
      eventBusStub,
      destroyExplorerStepStub,
      destroyRelayStepStub,
      destroyMirrorNodeStepStub,
      destroyBlockNodeStepStub,
      destroyConsensusNodeStepStub,
      clusterResetStepStub,
      clusterDisconnectStepStub,
      deploymentDeleteStepStub,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildDestroyTaskList', (): void => {
    it('passes exactly 7 phase tasks to parentTask.newListr', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      expect(newListrStub.calledOnce).to.be.true;
      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks).to.have.length(7);
    });

    it('passes concurrent: false to top-level newListr options', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('first phase is a composite with a task function (Destroy extended setup)', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks[0]).to.have.property('task').that.is.a('function');
    });

    it('composite phase runs explorer and relay steps concurrently with exitOnError: false', (): void => {
      const outerNewListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: outerNewListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = outerNewListrStub.firstCall.args[0] as unknown[];
      type PhaseTaskShape = {
        task?: (
          context: OneShotSingleDestroyContext,
          wrapper: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
        ) => unknown;
      };
      const compositeTask: PhaseTaskShape = tasks[0] as PhaseTaskShape;

      const innerNewListrStub: SinonStub = sinon.stub().returns([]);
      compositeTask.task?.(
        {} as OneShotSingleDestroyContext,
        {newListr: innerNewListrStub} as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>,
      );

      expect(innerNewListrStub.calledOnce).to.be.true;
      const options: {concurrent: boolean; exitOnError: boolean} = innerNewListrStub.firstCall.args[1] as {
        concurrent: boolean;
        exitOnError: boolean;
      };
      expect(options.concurrent).to.equal(true);
      expect(options.exitOnError).to.equal(false);
    });

    it('mirror, block, consensus, reset, disconnect, and delete phases delegate directly from their steps', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks[1]).to.deep.equal({title: 'destroy-mirror-task'});
      expect(tasks[2]).to.deep.equal({title: 'destroy-block-task'});
      expect(tasks[3]).to.deep.equal({title: 'destroy-consensus-task'});
      expect(tasks[4]).to.deep.equal({title: 'cluster-reset-task'});
      expect(tasks[5]).to.deep.equal({title: 'cluster-disconnect-task'});
      expect(tasks[6]).to.deep.equal({title: 'deployment-delete-task'});
    });
  });
});
