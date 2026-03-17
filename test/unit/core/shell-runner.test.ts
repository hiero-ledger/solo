// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {type SinonSpy, type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {ShellRunner} from '../../../src/core/shell-runner.js';
import {ChildProcess} from 'node:child_process';
import {Readable} from 'node:stream';
import {Duration} from '../../../src/core/time/duration.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {OperatingSystem} from '../../../src/business/utils/operating-system.js';

describe('ShellRunner', (): void => {
  let shellRunner: ShellRunner,
    loggerDebugStub: SinonStub,
    loggerInfoStub: SinonStub,
    childProcessSpy: SinonSpy,
    readableSpy: SinonSpy;

  beforeEach((): void => {
    shellRunner = new ShellRunner();

    // Spy on methods
    loggerDebugStub = sinon.stub(SoloPinoLogger.prototype, 'debug');
    loggerInfoStub = sinon.stub(SoloPinoLogger.prototype, 'info');
    childProcessSpy = sinon.spy(ChildProcess.prototype, 'on');
    readableSpy = sinon.spy(Readable.prototype, 'on');
  });

  afterEach((): void => sinon.restore());

  it('should run command', async (): Promise<void> => {
    const commandToRun: string = OperatingSystem.isWin32() ? 'dir' : 'ls -l';
    await shellRunner.run(commandToRun);

    loggerInfoStub.withArgs(`Executing command: '${commandToRun}'`).onFirstCall();
    loggerDebugStub.withArgs(`Finished executing: '${commandToRun}'`, sinon.match.any).onFirstCall();

    expect(loggerDebugStub).to.have.been.calledOnce;
    expect(loggerInfoStub).to.have.been.calledOnce;

    expect(readableSpy).to.have.been.calledWith('data', sinon.match.any);
    expect(childProcessSpy).to.have.been.calledWith('exit', sinon.match.any);
  }).timeout(Duration.ofSeconds(10).toMillis());

  it('should complete successfully within timeout', async (): Promise<void> => {
    const result: string[] = await shellRunner.run('echo hello', [], false, false, {}, 10_000);
    expect(result).to.include('hello');
  }).timeout(Duration.ofSeconds(15).toMillis());

  it('should reject with timeout error when command exceeds timeoutMs', async (): Promise<void> => {
    // Use a node one-liner as a cross-platform long-running command: works on all platforms
    // (Windows `timeout /t N` exits immediately when stdin is non-interactive in CI environments)
    const commandToRun: string = 'node -e "setTimeout(()=>{}, 10000)"';
    const timeoutMs: number = 500;

    await expect(shellRunner.run(commandToRun, [], false, false, {}, timeoutMs)).to.be.rejectedWith(
      `Command timed out after ${timeoutMs}ms`,
    );
  }).timeout(Duration.ofSeconds(10).toMillis());
});
