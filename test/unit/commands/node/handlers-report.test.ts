// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {NodeCommandHandlers} from '../../../../src/commands/node/handlers.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type LockManager} from '../../../../src/core/lock/lock-manager.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeCommandConfigs} from '../../../../src/commands/node/configs.js';
import {Flags as flags} from '../../../../src/commands/flags.js';

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
  let shellRunnerRunStub: SinonStub;
  let logsStub: SinonStub;
  let loggerStub: SoloLogger;

  beforeEach((): void => {
    loggerStub = makeLoggerStub();

    // Construct with minimal sinon stubs for every DI dependency
    const leaseManagerStub: LockManager = sinon.stub() as unknown as LockManager;
    const configManagerStub: ConfigManager = sinon.createStubInstance(
      // Use a plain object stub because ConfigManager is not directly instantiable
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

    handlers = new NodeCommandHandlers(
      leaseManagerStub,
      configManagerStub,
      localConfigStub,
      remoteConfigStub,
      tasksStub,
      configsStub,
    );

    // Inject the logger stub (NodeCommandHandlers inherits it from CommandHandler)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).logger = loggerStub;

    // Prevent the real `logs()` from running Listr tasks
    logsStub = sinon.stub(NodeCommandHandlers.prototype, 'logs').resolves(true);

    // Default: simulate `gh` not found
    shellRunnerRunStub = sinon.stub(ShellRunner.prototype, 'run').rejects(new Error('which: gh: not found'));
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('throws SoloError when gh CLI is not available', async (): Promise<void> => {
    const argv: Record<string, unknown> = {
      _: ['deployment', 'diagnostics', 'report'],
      [flags.quiet.name]: true,
    };

    await expect(handlers.report(argv)).to.be.rejectedWith(SoloError, /GitHub CLI \(gh\) is required/);

    expect(logsStub).to.have.been.calledOnce;
  });

  it('creates issue successfully when quiet flag is true and gh is available', async (): Promise<void> => {
    // Make `which gh` succeed
    shellRunnerRunStub.resolves(['/usr/bin/gh']);

    const argv: Record<string, unknown> = {
      _: ['deployment', 'diagnostics', 'report'],
      [flags.quiet.name]: true,
    };

    // The `gh issue create` call also uses ShellRunner.run; return a fake issue URL
    shellRunnerRunStub.onCall(1).resolves(['https://github.com/hiero-ledger/solo/issues/999']);

    await expect(handlers.report(argv)).to.not.be.rejected;
    expect(logsStub).to.have.been.calledOnce;
  });

  it('calls deployment diagnostics logs before checking for gh', async (): Promise<void> => {
    const argv: Record<string, unknown> = {
      _: ['deployment', 'diagnostics', 'report'],
      [flags.quiet.name]: true,
    };

    await expect(handlers.report(argv)).to.be.rejectedWith(SoloError);

    // logs() must be called before the gh check
    expect(logsStub).to.have.been.calledOnce;
  });
});
