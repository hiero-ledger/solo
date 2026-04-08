// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {NodeCommandHandlers} from '../../../../src/commands/node/handlers.js';
import {DiagnosticsReporter} from '../../../../src/commands/util/diagnostics-reporter.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type LockManager} from '../../../../src/core/lock/lock-manager.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeCommandConfigs} from '../../../../src/commands/node/configs.js';
import {type ArgvStruct} from '../../../../src/types/aliases.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';

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
    addMessageGroup: sinon.stub(),
    getMessageGroup: sinon.stub().returns([]),
    addMessageGroupMessage: sinon.stub(),
    showMessageGroup: sinon.stub(),
    getMessageGroupKeys: sinon.stub().returns([]),
    showAllMessageGroups: sinon.stub(),
    setDevMode: sinon.stub(),
    isDevMode: sinon.stub().returns(false),
    nextTraceId: sinon.stub(),
    prepMeta: sinon.stub().callsFake((meta?: object): object => meta ?? {}),
    flush: sinon.stub().callsFake((callback: (error?: Error) => void): void => callback()),
  } as unknown as SoloLogger;
}

describe('NodeCommandHandlers - report', (): void => {
  let handlers: NodeCommandHandlers;
  let debugStub: SinonStub;
  let isGhCliAvailableStub: SinonStub;
  let createGitHubIssueStub: SinonStub;
  let loggerStub: SoloLogger;

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
    const tasksStub: NodeCommandTasks = sinon.stub() as unknown as NodeCommandTasks;
    const configsStub: NodeCommandConfigs = sinon.stub() as unknown as NodeCommandConfigs;
    const k8FactoryStub: K8Factory = sinon.stub() as unknown as K8Factory;

    handlers = new NodeCommandHandlers(
      leaseManagerStub,
      configManagerStub,
      localConfigStub,
      remoteConfigStub,
      tasksStub,
      configsStub,
      k8FactoryStub,
    );

    // Inject the logger stub
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).logger = loggerStub;

    // Prevent the real `debug()` from running Listr tasks
    debugStub = sinon.stub(NodeCommandHandlers.prototype, 'debug').resolves(true);

    // Default: gh CLI not available
    isGhCliAvailableStub = sinon.stub(DiagnosticsReporter, 'isGhCliAvailable').resolves(false);

    // Stub createGitHubIssue to avoid real network calls
    createGitHubIssueStub = sinon
      .stub(DiagnosticsReporter, 'createGitHubIssue')
      .resolves('https://github.com/hiero-ledger/solo/issues/999');
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('throws SoloError when gh CLI is not available', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: ['deployment', 'diagnostics', 'report'],
      [flags.quiet.name]: true,
    };

    await expect(handlers.report(argv)).to.be.rejectedWith(SoloError, /GitHub CLI \(gh\) is required/);

    expect(debugStub).to.have.been.calledOnce;
  });

  it('creates issue successfully when quiet flag is true and gh is available', async (): Promise<void> => {
    isGhCliAvailableStub.resolves(true);

    const argv: ArgvStruct = {
      _: ['deployment', 'diagnostics', 'report'],
      [flags.quiet.name]: true,
    };

    const result: boolean = await handlers.report(argv);

    expect(result).to.equal(true);
    expect(debugStub).to.have.been.calledOnce;
    expect(createGitHubIssueStub).to.have.been.calledOnce;
  });

  it('calls deployment diagnostics debug before checking for gh', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: ['deployment', 'diagnostics', 'report'],
      [flags.quiet.name]: true,
    };

    await expect(handlers.report(argv)).to.be.rejectedWith(SoloError);

    // debug() must be called before the gh check
    expect(debugStub).to.have.been.calledOnce;
    expect(isGhCliAvailableStub).to.have.been.calledAfter(debugStub);
  });
});
