// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {Phase, type ExecutionMode} from '../../../../../src/commands/one-shot/orchestrator/phase.js';
import {type OrchestratorStep} from '../../../../../src/commands/one-shot/orchestrator/orchestrator-step.js';
import {type SoloEventBus} from '../../../../../src/core/events/solo-event-bus.js';
import {SoloEventType} from '../../../../../src/core/events/event-types/event-types.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../../src/types/index.js';

type SimpleConfig = {deployment: string};
type SimpleContext = object;

describe('Phase', (): void => {
  let stepTaskStub: SoloListrTask<SimpleContext>;
  let stepStub: OrchestratorStep<SimpleConfig, SimpleContext>;
  let asListrTaskStub: SinonStub;
  let eventBusStub: SoloEventBus;
  let waitForStub: SinonStub;
  const config: SimpleConfig = {deployment: 'test-deployment'};

  beforeEach((): void => {
    stepTaskStub = {title: 'stub-step-task'} as SoloListrTask<SimpleContext>;
    asListrTaskStub = sinon.stub().returns(stepTaskStub);
    stepStub = {asListrTask: asListrTaskStub};
    waitForStub = sinon.stub().resolves({deployment: 'test-deployment'});
    eventBusStub = {waitFor: waitForStub} as unknown as SoloEventBus;
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('withWaitCondition', (): void => {
    it('is chainable and returns the same Phase instance', (): void => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub);
      const result: Phase<SimpleConfig, SimpleContext> = phase.withWaitCondition(SoloEventType.MirrorNodeDeployed);
      expect(result).to.equal(phase);
    });
  });

  describe('asListrTask (no wait conditions)', (): void => {
    it('returns the step task directly without wrapping', (): void => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub);
      const task: SoloListrTask<SimpleContext> = phase.asListrTask(config, eventBusStub);
      expect(task).to.equal(stepTaskStub);
      expect(asListrTaskStub.calledOnceWith(config)).to.be.true;
    });

    it('does not call eventBus.waitFor', (): void => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub);
      phase.asListrTask(config, eventBusStub);
      expect(waitForStub.called).to.be.false;
    });
  });

  describe('asListrTask (one wait condition)', (): void => {
    it('returns a wrapper task with a task function instead of the step task directly', (): void => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub).withWaitCondition(
        SoloEventType.MirrorNodeDeployed,
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask(config, eventBusStub);
      expect(task).to.not.equal(stepTaskStub);
      expect(task).to.have.property('task').that.is.a('function');
    });

    it('wrapper task calls eventBus.waitFor with the correct event type', async (): Promise<void> => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub).withWaitCondition(
        SoloEventType.MirrorNodeDeployed,
        Duration.ofMinutes(10),
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(waitForStub.calledOnce).to.be.true;
      expect(waitForStub.firstCall.args[0]).to.equal(SoloEventType.MirrorNodeDeployed);
    });

    it('waitFor predicate matches events for the configured deployment', async (): Promise<void> => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub).withWaitCondition(
        SoloEventType.MirrorNodeDeployed,
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      const predicate: (event: {deployment: string}) => boolean = waitForStub.firstCall.args[1];
      expect(predicate({deployment: 'test-deployment'})).to.be.true;
      expect(predicate({deployment: 'other-deployment'})).to.be.false;
    });

    it('wrapper task calls step.asListrTask after waiting', async (): Promise<void> => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub).withWaitCondition(
        SoloEventType.MirrorNodeDeployed,
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(asListrTaskStub.calledOnceWith(config)).to.be.true;
      expect(newListrStub.calledOnce).to.be.true;
    });
  });

  describe('asListrTask (two wait conditions)', (): void => {
    it('calls eventBus.waitFor twice in order for both event types', async (): Promise<void> => {
      const phase: Phase<SimpleConfig, SimpleContext> = new Phase('test phase', stepStub)
        .withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10))
        .withWaitCondition(SoloEventType.NodesStarted, Duration.ofMinutes(5));
      const task: SoloListrTask<SimpleContext> = phase.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(waitForStub.calledTwice).to.be.true;
      expect(waitForStub.firstCall.args[0]).to.equal(SoloEventType.MirrorNodeDeployed);
      expect(waitForStub.secondCall.args[0]).to.equal(SoloEventType.NodesStarted);
    });
  });

  describe('Phase.composite', (): void => {
    let childStepStubA: OrchestratorStep<SimpleConfig, SimpleContext>;
    let childStepStubB: OrchestratorStep<SimpleConfig, SimpleContext>;
    let childPhaseA: Phase<SimpleConfig, SimpleContext>;
    let childPhaseB: Phase<SimpleConfig, SimpleContext>;

    beforeEach((): void => {
      childStepStubA = {asListrTask: sinon.stub().returns({title: 'child-a'})} as OrchestratorStep<
        SimpleConfig,
        SimpleContext
      >;
      childStepStubB = {asListrTask: sinon.stub().returns({title: 'child-b'})} as OrchestratorStep<
        SimpleConfig,
        SimpleContext
      >;
      childPhaseA = new Phase('child a', childStepStubA);
      childPhaseB = new Phase('child b', childStepStubB);
    });

    it('asListrTask returns a wrapper task with a task function, not the child step directly', (): void => {
      const composite: Phase<SimpleConfig, SimpleContext> = Phase.composite('parent', [childPhaseA, childPhaseB]);
      const task: SoloListrTask<SimpleContext> = composite.asListrTask(config, eventBusStub);
      expect(task).to.have.property('task').that.is.a('function');
    });

    it('sequential composite passes concurrent: false to newListr', (): void => {
      const composite: Phase<SimpleConfig, SimpleContext> = Phase.composite('parent', [childPhaseA], 'sequential');
      const task: SoloListrTask<SimpleContext> = composite.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('concurrent composite passes concurrent: true to newListr', (): void => {
      const composite: Phase<SimpleConfig, SimpleContext> = Phase.composite('parent', [childPhaseA], 'concurrent');
      const task: SoloListrTask<SimpleContext> = composite.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(true);
    });

    it('exitOnError: false is passed through when specified', (): void => {
      const composite: Phase<SimpleConfig, SimpleContext> = Phase.composite(
        'parent',
        [childPhaseA],
        'concurrent',
        false,
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {exitOnError: boolean}).exitOnError).to.equal(false);
    });

    it('calls each child phase asListrTask with the same config and eventBus', (): void => {
      const composite: Phase<SimpleConfig, SimpleContext> = Phase.composite('parent', [childPhaseA, childPhaseB]);
      const task: SoloListrTask<SimpleContext> = composite.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      const childTasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(childTasks).to.have.length(2);
      expect(childTasks[0]).to.deep.equal({title: 'child-a'});
      expect(childTasks[1]).to.deep.equal({title: 'child-b'});
    });

    it('defaults to sequential execution mode when not specified', (): void => {
      const composite: Phase<SimpleConfig, SimpleContext> = Phase.composite('parent', [childPhaseA]);
      const task: SoloListrTask<SimpleContext> = composite.asListrTask(config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('ExecutionMode type covers sequential and concurrent', (): void => {
      const sequential: ExecutionMode = 'sequential';
      const concurrent: ExecutionMode = 'concurrent';
      expect(sequential).to.equal('sequential');
      expect(concurrent).to.equal('concurrent');
    });
  });
});
