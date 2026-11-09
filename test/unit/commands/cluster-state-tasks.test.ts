// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {ClusterStateService} from '../../../src/integration/container-engine/cluster-state-service.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {StringFacade} from '../../../src/business/runtime-state/facade/string-facade.js';
import {type AnyListrContext} from '../../../src/types/aliases.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../src/types/index.js';
import {type KindClusterContainer} from '../../../src/integration/container-engine/kind-cluster-container.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

const SOLO_CONTAINER: KindClusterContainer = {
  containerName: 'solo-e2e-control-plane',
  clusterName: 'solo-e2e',
  running: true,
  engineCommand: {executable: 'docker', argumentsPrefix: []},
};
const FOREIGN_CONTAINER: KindClusterContainer = {
  containerName: 'someone-elses-control-plane',
  clusterName: 'someone-elses',
  running: true,
  engineCommand: {executable: 'docker', argumentsPrefix: []},
};

const runTask: (task: SoloListrTask<AnyListrContext>) => Promise<void> = async (
  task: SoloListrTask<AnyListrContext>,
): Promise<void> => {
  await (task.task as (context_: AnyListrContext, wrapper: SoloListrTaskWrapper<AnyListrContext>) => Promise<void>)(
    {} as AnyListrContext,
    {} as SoloListrTaskWrapper<AnyListrContext>,
  );
};

const writeClusterReferences: (references: Record<string, string>) => Promise<void> = async (
  references: Record<string, string>,
): Promise<void> => {
  const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
  await localConfig.load();
  localConfig.configuration.clusterRefs.clear();
  for (const [clusterReference, context] of Object.entries(references)) {
    localConfig.configuration.clusterRefs.set(clusterReference, new StringFacade(context));
  }
  await localConfig.persist();
};

describe('ClusterCommandTasks state scoping', (): void => {
  let sandbox: SinonSandbox;
  let stopContainersStub: SinonStub;
  let startContainersStub: SinonStub;
  let startEngineStub: SinonStub;
  let listContainersStub: SinonStub;
  let showUserStub: SinonStub;
  let tasks: ClusterCommandTasks;

  beforeEach((): void => {
    resetForTest();
    sandbox = sinon.createSandbox();

    sandbox.stub(ClusterStateService.prototype, 'getEngineState').resolves({engineName: 'docker', running: true});
    listContainersStub = sandbox
      .stub(ClusterStateService.prototype, 'listKindClusterContainers')
      .resolves([SOLO_CONTAINER, FOREIGN_CONTAINER]);
    stopContainersStub = sandbox.stub(ClusterStateService.prototype, 'stopContainers').resolves();
    startContainersStub = sandbox.stub(ClusterStateService.prototype, 'startContainers').resolves();
    startEngineStub = sandbox
      .stub(ClusterStateService.prototype, 'startEngine')
      .resolves({engineName: 'docker', running: true});

    tasks = container.resolve(ClusterCommandTasks);
    showUserStub = sandbox.stub((tasks as unknown as {logger: SoloLogger}).logger, 'showUser');
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it('stops only the Kind clusters mapped to a Solo cluster reference', async (): Promise<void> => {
    await writeClusterReferences({solo: 'kind-solo-e2e'});

    await runTask(tasks.stopClusterState());

    expect(stopContainersStub.calledOnceWith([SOLO_CONTAINER])).to.be.true;
    expect(listContainersStub.calledOnceWith('docker', ['solo-e2e'])).to.be.true;
  });

  it('starts the engine, then only the stopped Kind containers of Solo cluster references', async (): Promise<void> => {
    await writeClusterReferences({solo: 'kind-solo-e2e'});
    const stoppedSoloContainer: KindClusterContainer = {...SOLO_CONTAINER, running: false};
    listContainersStub.resolves([stoppedSoloContainer, {...FOREIGN_CONTAINER, running: false}]);

    await runTask(tasks.startClusterState());

    expect(startEngineStub.calledOnce).to.be.true;
    expect(startContainersStub.calledOnceWith([stoppedSoloContainer])).to.be.true;
  });

  it('starts nothing when the Solo Kind containers are already running', async (): Promise<void> => {
    await writeClusterReferences({solo: 'kind-solo-e2e'});

    await runTask(tasks.startClusterState());

    expect(startContainersStub.called).to.be.false;
    expect(showUserStub.calledWithMatch(/already running/)).to.be.true;
  });

  it('reports every Kind cluster in info and marks which ones Solo manages', async (): Promise<void> => {
    await writeClusterReferences({solo: 'kind-solo-e2e'});

    await runTask(tasks.showClusterStateInfo());

    const output: string = showUserStub.lastCall.args[0];
    expect(output).to.contain('Container engine state:  running');
    expect(output).to.contain('solo-e2e: running (solo-e2e-control-plane) [cluster-ref: solo]');
    expect(output).to.contain('someone-elses: running (someone-elses-control-plane) [not managed by Solo]');
  });

  it('lists a Solo cluster whose Kind container is missing as not-found in info', async (): Promise<void> => {
    await writeClusterReferences({solo: 'kind-solo-e2e', gone: 'kind-deleted-cluster'});

    await runTask(tasks.showClusterStateInfo());

    expect(showUserStub.lastCall.args[0]).to.contain('  - deleted-cluster: not-found [cluster-ref: gone]');
  });

  it('names the Solo cluster without a Kind container when stop finds nothing to stop', async (): Promise<void> => {
    await writeClusterReferences({gone: 'kind-deleted-cluster'});

    await expect(runTask(tasks.stopClusterState())).to.be.rejectedWith(
      /No Kind container was found for the Solo cluster\(s\) deleted-cluster \[cluster-ref: gone\]/,
    );
    expect(stopContainersStub.called).to.be.false;
  });

  it('reports unknown Kind containers in info when the engine is stopped', async (): Promise<void> => {
    (ClusterStateService.prototype.getEngineState as SinonStub).resolves({engineName: 'docker', running: false});

    await runTask(tasks.showClusterStateInfo());

    expect(showUserStub.lastCall.args[0]).to.contain('Container engine state:  stopped');
    expect(listContainersStub.called).to.be.false;
  });

  it('fails without stopping anything when no Kind cluster is mapped to a Solo cluster reference', async (): Promise<void> => {
    await writeClusterReferences({remote: 'some-remote-context'});

    await expect(runTask(tasks.stopClusterState())).to.be.rejectedWith(/None of the detected Kind clusters/);
    expect(stopContainersStub.called).to.be.false;
  });
});
