// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {ConsensusNodePathTemplates} from '../../../../src/core/consensus-node-path-templates.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

type FakeContainer = {execContainer: sinon.SinonStub; copyTo: sinon.SinonStub};

function createTasks(container: FakeContainer): NodeCommandTasks {
  const tasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (tasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (): {containers: () => {readByRef: () => FakeContainer}} => ({
      containers: (): {readByRef: () => FakeContainer} => ({
        readByRef: (): FakeContainer => container,
      }),
    }),
  };

  (tasks as unknown as {logger: unknown}).logger = {
    debug: (): void => {},
    info: (): void => {},
    showUserError: (): void => {},
  };

  return tasks;
}

function commandsRun(container: FakeContainer): string[] {
  return container.execContainer.getCalls().map((call): string => (call.args[0] as string[]).join(' '));
}

describe('uploadStateFiles override-network.json', (): void => {
  let temporaryDirectory: string;

  afterEach((): void => {
    sinon.restore();
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      temporaryDirectory = undefined;
    }
  });

  async function runUpload(): Promise<FakeContainer> {
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'upload-state-'));
    const stateFile: string = PathEx.join(temporaryDirectory, 'node1-state.zip');
    fs.writeFileSync(stateFile, 'not a real archive, the container is stubbed');

    const container: FakeContainer = {execContainer: sinon.stub().resolves(), copyTo: sinon.stub().resolves()};
    const tasks: NodeCommandTasks = createTasks(container);

    const task: SoloListrTask<AnyListrContext> = tasks.uploadStateFiles(false) as SoloListrTask<AnyListrContext>;

    await task.task(
      {
        config: {
          namespace: NamespaceName.of('solo-e2e'),
          nodeAliases: ['node1'],
          consensusNodes: [{name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'}],
          podRefs: {node1: PodReference.of(NamespaceName.of('solo-e2e'), PodName.of('network-node1-0'))},
          stateFile,
        },
      } as unknown as AnyListrContext,
      {} as unknown as SoloListrTaskWrapper<AnyListrContext>,
    );

    return container;
  }

  it('installs the current roster as override-network.json so the restored state does not keep the old one', async (): Promise<void> => {
    const container: FakeContainer = await runUpload();

    const overrideCommand: string | undefined = commandsRun(container).find((command): boolean =>
      command.includes(ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON),
    );

    expect(overrideCommand, 'expected a command writing override-network.json').to.not.equal(undefined);
    expect(overrideCommand).to.include(
      `cp -p ${ConsensusNodePathTemplates.ARCHIVE_GENESIS_NETWORK_JSON} ${ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON}`,
    );
  });

  it('preserves ownership so the hedera user can read it, since the copy runs as root', async (): Promise<void> => {
    const container: FakeContainer = await runUpload();

    for (const command of commandsRun(container).filter((candidate): boolean =>
      candidate.includes(ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON),
    )) {
      expect(command, 'a plain cp would leave the file root-owned and unreadable by the node').to.not.match(
        /\bcp (?!-p\b)/,
      );
    }
  });

  it('falls back to the live roster when the archive is absent, and fails only when neither exists', async (): Promise<void> => {
    const container: FakeContainer = await runUpload();

    const overrideCommand: string = commandsRun(container).find((command): boolean =>
      command.includes(ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON),
    );

    expect(overrideCommand).to.include(`if [ -f ${ConsensusNodePathTemplates.ARCHIVE_GENESIS_NETWORK_JSON} ]`);
    expect(overrideCommand).to.include(`elif [ -f ${ConsensusNodePathTemplates.GENESIS_NETWORK_JSON} ]`);
    expect(overrideCommand).to.include('exit 1');
  });

  it('writes the override after the state is extracted, so it cannot be overwritten by the restore', async (): Promise<void> => {
    const container: FakeContainer = await runUpload();
    const commands: string[] = commandsRun(container);

    const extractIndex: number = commands.findIndex((command): boolean => command.includes('data/saved'));
    const overrideIndex: number = commands.findIndex((command): boolean =>
      command.includes(ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON),
    );

    expect(extractIndex).to.be.greaterThan(-1);
    expect(overrideIndex).to.be.greaterThan(extractIndex);
  });
});
