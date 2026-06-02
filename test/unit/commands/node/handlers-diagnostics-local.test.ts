// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {NodeCommandHandlers} from '../../../../src/commands/node/handlers.js';
import {DiagnosticsCollector} from '../../../../src/commands/util/diagnostics-collector.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type LockManager} from '../../../../src/core/lock/lock-manager.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeCommandConfigs} from '../../../../src/commands/node/configs.js';
import {type ArgvStruct} from '../../../../src/types/aliases.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type SoloListrTask} from '../../../../src/types/index.js';

/**
 * Creates a minimal stub for SoloLogger sufficient for NodeCommandHandlers construction.
 */
function makeLoggerStub(): SoloLogger {
  return {
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    debug: sinon.stub(),
    showUser: sinon.stub(),
    showUserError: sinon.stub(),
    showList: sinon.stub(),
    showJSON: sinon.stub(),
  } as unknown as SoloLogger;
}

/**
 * Builds a K8 stub whose context exists but whose cluster does not answer API calls,
 * mirroring a stale kubeconfig context pointing at a torn-down cluster.
 */
function makeUnreachableK8(): K8 {
  return {
    contexts: (): {readCurrent: () => string} => ({readCurrent: (): string => 'kind-solo'}),
    namespaces: (): {list: () => Promise<never>} => ({
      list: (): Promise<never> => Promise.reject(new Error('ECONNREFUSED')),
    }),
  } as unknown as K8;
}

describe('NodeCommandHandlers - diagnostics local fallback', (): void => {
  let handlers: NodeCommandHandlers;
  let loggerStub: SoloLogger;
  let collectLocalDiagnosticsStub: SinonStub;
  let analyzeStub: SinonStub;
  let initializeStub: SinonStub;
  let resolveDeploymentForLogsStub: SinonStub;
  let commandActionStub: SinonStub;
  let defaultK8Stub: SinonStub;

  beforeEach((): void => {
    loggerStub = makeLoggerStub();

    const leaseManagerStub: LockManager = sinon.stub() as unknown as LockManager;
    const configManagerStub: ConfigManager = sinon.createStubInstance(
      class FakeConfigManager {
        public update(): void {}
        public getFlag<T>(): T {
          return '' as unknown as T;
        }
      },
    ) as unknown as ConfigManager;

    const localConfigStub: LocalConfigRuntimeState = sinon.stub() as unknown as LocalConfigRuntimeState;
    const remoteConfigStub: RemoteConfigRuntimeStateApi = sinon.stub() as unknown as RemoteConfigRuntimeStateApi;

    const dummyTask: SoloListrTask<object> = {title: 'dummy', task: async (): Promise<void> => {}};
    analyzeStub = sinon.stub().returns(dummyTask);
    initializeStub = sinon.stub().returns(dummyTask);
    const tasksStub: NodeCommandTasks = {
      analyzeCollectedDiagnostics: analyzeStub,
      initialize: initializeStub,
      getNodeLogsAndConfigs: sinon.stub().returns(dummyTask),
      getHelmChartValues: sinon.stub().returns(dummyTask),
      downloadHieroComponentLogs: sinon.stub().returns(dummyTask),
      reportActivePortForwards: sinon.stub().returns(dummyTask),
    } as unknown as NodeCommandTasks;

    const configsStub: NodeCommandConfigs = {
      logsConfigBuilder: sinon.stub(),
    } as unknown as NodeCommandConfigs;

    // Default: no active Kubernetes context at all -> k8Factory.default() throws.
    // Individual tests may override defaultK8Stub to simulate a stale/unreachable cluster.
    defaultK8Stub = sinon.stub().throws(new Error('No active kubernetes context found.'));
    const k8FactoryStub: K8Factory = {
      default: defaultK8Stub,
    } as unknown as K8Factory;

    handlers = new NodeCommandHandlers(
      leaseManagerStub,
      configManagerStub,
      localConfigStub,
      remoteConfigStub,
      tasksStub,
      configsStub,
      k8FactoryStub,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).logger = loggerStub;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).nodeConfigManager = configManagerStub;

    resolveDeploymentForLogsStub = sinon
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .stub(NodeCommandHandlers.prototype as any, 'resolveDeploymentForLogs')
      .resolves('should-not-be-called');

    const dummyCollectTask: SoloListrTask<object> = {title: 'collect', task: async (): Promise<void> => {}};
    collectLocalDiagnosticsStub = sinon.stub(DiagnosticsCollector, 'collectLocalDiagnostics').returns(dummyCollectTask);

    commandActionStub = sinon.stub(NodeCommandHandlers.prototype, 'commandAction').resolves();
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('logs collects local diagnostics when no active kube context is present', async (): Promise<void> => {
    const argv: ArgvStruct = {_: ['deployment', 'diagnostics', 'logs']} as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(commandActionStub).to.have.been.calledOnce;
    // Must not attempt cluster-dependent deployment resolution or the initialize task.
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('logs collects local diagnostics when the context is stale and the cluster is unreachable', async (): Promise<void> => {
    // Context exists (kubeconfig entry survives the cluster) but the API call is refused.
    defaultK8Stub.returns(makeUnreachableK8());

    const argv: ArgvStruct = {_: ['deployment', 'diagnostics', 'logs']} as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('all collects local diagnostics when no active kube context is present', async (): Promise<void> => {
    const argv: ArgvStruct = {_: ['deployment', 'diagnostics', 'all']} as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('all collects local diagnostics when the context is stale and the cluster is unreachable', async (): Promise<void> => {
    defaultK8Stub.returns(makeUnreachableK8());

    const argv: ArgvStruct = {_: ['deployment', 'diagnostics', 'all']} as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });
});
