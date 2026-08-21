// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {ConsensusNodePathTemplates} from '../../../../src/core/consensus-node-path-templates.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import * as constants from '../../../../src/core/constants.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

type FakeContainer = {execContainer: sinon.SinonStub; copyTo: sinon.SinonStub};

const generatedRoster: string = '/staging/override-network.json';

function createTasks(container: FakeContainer): NodeCommandTasks {
  const tasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (tasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (): {containers: () => {readByRef: () => FakeContainer}} => ({
      containers: (): {readByRef: () => FakeContainer} => ({
        readByRef: (): FakeContainer => container,
      }),
    }),
  };

  // Generation reads the live remote config and service map; stubbed so this stays a unit test.
  (tasks as unknown as {generateNetworkJson: unknown}).generateNetworkJson = sinon.stub().resolves(generatedRoster);

  return tasks;
}

async function runTask(tasks: NodeCommandTasks): Promise<void> {
  const task: SoloListrTask<AnyListrContext> = tasks.installOverrideNetworkJson(
    false,
  ) as unknown as SoloListrTask<AnyListrContext>;

  await task.task(
    {
      config: {
        namespace: NamespaceName.of('solo-e2e'),
        nodeAliases: ['node1'],
        consensusNodes: [{name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'}],
        // Deliberately no stagingDir/cacheDir: START_FLAGS omits the flags that populate them, so the real
        // start config has neither. Supplying them here once hid a crash on `undefined`.
        podRefs: {node1: PodReference.of(NamespaceName.of('solo-e2e'), PodName.of('network-node1-0'))},
      },
    } as unknown as AnyListrContext,
    {} as unknown as SoloListrTaskWrapper<AnyListrContext>,
  );
}

function generateStub(tasks: NodeCommandTasks): sinon.SinonStub {
  return (tasks as unknown as {generateNetworkJson: sinon.SinonStub}).generateNetworkJson;
}

describe('installOverrideNetworkJson', (): void => {
  let container: FakeContainer;
  let tasks: NodeCommandTasks;

  afterEach((): void => {
    sinon.restore();
  });

  beforeEach((): void => {
    container = {execContainer: sinon.stub().resolves(), copyTo: sinon.stub().resolves()};
    tasks = createTasks(container);
  });

  it('derives the roster from live state rather than a genesis-time snapshot', async (): Promise<void> => {
    await runTask(tasks);

    const generate: sinon.SinonStub = generateStub(tasks);
    expect(generate.calledOnce, 'the roster should be generated, not copied').to.be.true;
    expect(generate.firstCall.args[0]).to.equal(constants.OVERRIDE_NETWORK_FILE);
    // Generating from the namespace and the current consensus nodes is what keeps it current after a
    // node add or update.
    expect(generate.firstCall.args[2]).to.deep.equal([
      {name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'},
    ]);
    // A defined output directory, not config.stagingDir, which `node start` never populates.
    expect(generate.firstCall.args[3]).to.equal(constants.SOLO_CACHE_DIR);
  });

  it('places it where the consensus node looks for it', async (): Promise<void> => {
    await runTask(tasks);

    expect(container.copyTo.calledOnceWithExactly(generatedRoster, ConsensusNodePathTemplates.DATA_CONFIG)).to.be.true;
  });

  it('hands it to the hedera user, since copyTo lands it as root', async (): Promise<void> => {
    await runTask(tasks);

    const commands: string[] = container.execContainer
      .getCalls()
      .map((call): string => (call.args[0] as string[]).join(' '));

    expect(
      commands.some(
        (command): boolean =>
          command.includes('chown hedera:hedera') && command.includes(ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON),
      ),
      'a root-owned override is silently rejected by the node with AccessDeniedException',
    ).to.be.true;
  });

  it('carries the skip decision through, so a plain start writes nothing', (): void => {
    const skip: () => boolean = (): boolean => true;
    expect(tasks.installOverrideNetworkJson(skip).skip).to.equal(skip);
  });

  // The predicate `consensus node start` supplies. Getting this wrong installed an override on every state
  // restore, which broke the state-save-and-restore example: replacing the roster in a network's own state
  // forces a roster transition the consensus node cannot replay past.
  describe('the skip predicate used by consensus node start', (): void => {
    const skipPredicate = ({config}: {config: {transplant?: boolean; stateFile: string}}): boolean =>
      !config.transplant || config.stateFile.length === 0;

    it('runs only when a transplant is asked for and a state is supplied', (): void => {
      expect(skipPredicate({config: {transplant: true, stateFile: '/tmp/state.zip'}})).to.be.false;
    });

    it('skips a restore of the network own state, which must keep the roster in that state', (): void => {
      expect(skipPredicate({config: {transplant: false, stateFile: '/tmp/state.zip'}})).to.be.true;
      expect(skipPredicate({config: {stateFile: '/tmp/state.zip'}})).to.be.true;
    });

    it('skips a plain start, where there is no state to override anything for', (): void => {
      expect(skipPredicate({config: {transplant: true, stateFile: ''}})).to.be.true;
      expect(skipPredicate({config: {stateFile: ''}})).to.be.true;
    });
  });
});
