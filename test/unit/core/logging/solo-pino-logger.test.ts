// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub, type SinonFakeTimers} from 'sinon';
import {EventEmitter} from 'node:events';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import {OneShotState} from '../../../../src/core/one-shot-state.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

function lineLogged(stub: SinonStub, substring: string): boolean {
  return stub.getCalls().some((call): boolean => String(call.args[0]).includes(substring));
}

// Minimal writable-like stub matching what flush() touches: `.end()` and the 'close' event.
// EventEmitter (not EventTarget) is required — the code under test uses `.once()`/`.emit()`.
type FakeStream = EventEmitter & {end: SinonStub};

function createFakeStream(): FakeStream {
  // eslint-disable-next-line unicorn/prefer-event-target
  return Object.assign(new EventEmitter(), {end: sinon.stub()}) as FakeStream;
}

// Typed view over the private members flush() and the constructor manage.
type LoggerInternals = {
  rotatingStreams: FakeStream[];
  pinoLogger: {flush: (callback: (error?: Error) => void) => void};
};

function internalsOf(logger: SoloPinoLogger): LoggerInternals {
  return logger as unknown as LoggerInternals;
}

describe('SoloPinoLogger user-facing output', (): void => {
  let oneShotState: OneShotState;
  let logger: SoloPinoLogger;
  let consoleLogStub: SinonStub;
  let debugStub: SinonStub;

  beforeEach((): void => {
    oneShotState = new OneShotState();
    logger = new SoloPinoLogger('debug', true, oneShotState);
    consoleLogStub = sinon.stub(console, 'log');
    // Avoid touching the pino transports for the structured-log assertions.
    debugStub = sinon.stub(logger, 'debug');
    sinon.stub(logger, 'info');
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('showUserUnlessOneShot', (): void => {
    it('writes to the terminal when one-shot mode is inactive', (): void => {
      oneShotState.deactivate();

      logger.showUserUnlessOneShot('hello');

      expect(consoleLogStub.calledOnceWithExactly('hello')).to.be.true;
      expect(debugStub.called).to.be.false;
    });

    it('routes to the structured log only when one-shot mode is active', (): void => {
      oneShotState.activate();

      logger.showUserUnlessOneShot('hello');

      expect(consoleLogStub.called).to.be.false;
      expect(debugStub.calledOnceWithExactly('hello')).to.be.true;
    });
  });

  describe('deferred user output', (): void => {
    it('buffers terminal output between begin and flush', (): void => {
      logger.beginDeferredUserOutput();

      logger.showUser('first');
      logger.showUser('second');

      expect(consoleLogStub.called).to.be.false;

      logger.flushDeferredUserOutput();

      expect(consoleLogStub.callCount).to.equal(2);
      expect(consoleLogStub.firstCall.args).to.deep.equal(['first']);
      expect(consoleLogStub.secondCall.args).to.deep.equal(['second']);
    });

    it('does not discard buffered output when begin is called twice (`??=` guard)', (): void => {
      logger.beginDeferredUserOutput();
      logger.showUser('buffered');
      logger.beginDeferredUserOutput();

      logger.flushDeferredUserOutput();

      expect(consoleLogStub.calledOnceWithExactly('buffered')).to.be.true;
    });

    it('clears the buffer on flush so a second flush is a no-op', (): void => {
      logger.beginDeferredUserOutput();
      logger.showUser('once');

      logger.flushDeferredUserOutput();
      expect(consoleLogStub.callCount).to.equal(1);

      logger.flushDeferredUserOutput();
      expect(consoleLogStub.callCount).to.equal(1);
    });

    it('resumes immediate terminal output after a flush', (): void => {
      logger.beginDeferredUserOutput();
      logger.showUser('buffered');
      logger.flushDeferredUserOutput();
      consoleLogStub.resetHistory();

      logger.showUser('immediate');

      expect(consoleLogStub.calledOnceWithExactly('immediate')).to.be.true;
    });
  });

  describe('showList', (): void => {
    it('renders the `[ None ]` empty state for an empty list', (): void => {
      logger.showList('Some Title', []);

      expect(lineLogged(consoleLogStub, 'Some Title')).to.be.true;
      expect(lineLogged(consoleLogStub, '[ None ]')).to.be.true;
    });

    it('renders the items for a non-empty list', (): void => {
      logger.showList('Some Title', ['alpha', 'beta']);

      expect(lineLogged(consoleLogStub, 'alpha')).to.be.true;
      expect(lineLogged(consoleLogStub, 'beta')).to.be.true;
      expect(lineLogged(consoleLogStub, '[ None ]')).to.be.false;
    });
  });

  describe('showListIfNotEmpty', (): void => {
    it('renders nothing for an empty list', (): void => {
      logger.showListIfNotEmpty('Some Title', []);

      expect(consoleLogStub.called).to.be.false;
    });

    it('renders the list (without `[ None ]`) for a non-empty list', (): void => {
      logger.showListIfNotEmpty('Some Title', ['alpha']);

      expect(lineLogged(consoleLogStub, 'Some Title')).to.be.true;
      expect(lineLogged(consoleLogStub, 'alpha')).to.be.true;
      expect(lineLogged(consoleLogStub, '[ None ]')).to.be.false;
    });
  });

  describe('showUserError troubleshooting steps', (): void => {
    it('shows the steps of the deepest SoloError in the cause chain', (): void => {
      const nonDevelopmentLogger: SoloPinoLogger = new SoloPinoLogger('debug', false, oneShotState);
      const relayError: SoloError = new SoloErrors.component.relayDeployFailed(new Error('image pull failed'));
      const oneShotError: SoloError = new SoloErrors.component.oneShotDeployFailed(
        `Deploy failed: ${relayError.message}`,
        relayError,
      );

      nonDevelopmentLogger.showUserError(oneShotError);

      expect(lineLogged(consoleLogStub, 'Deploy failed:')).to.be.true;
      expect(lineLogged(consoleLogStub, 'Inspect relay pods')).to.be.true;
      expect(lineLogged(consoleLogStub, 'one-shot single destroy')).to.be.false;
    });

    it('falls back to the top-level error steps when no cause carries steps', (): void => {
      const nonDevelopmentLogger: SoloPinoLogger = new SoloPinoLogger('debug', false, oneShotState);
      const oneShotError: SoloError = new SoloErrors.component.oneShotDeployFailed(
        'Deploy failed: boom',
        new Error('boom'),
      );

      nonDevelopmentLogger.showUserError(oneShotError);

      expect(lineLogged(consoleLogStub, 'clean up partial resources')).to.be.true;
    });
  });
});

describe('SoloPinoLogger flush', (): void => {
  let originalCi: string | undefined;
  let logger: SoloPinoLogger;
  let internals: LoggerInternals;
  let infoStub: SinonStub;

  beforeEach((): void => {
    originalCi = process.env.CI;
    // Force the CI branch so the constructor leaves `rotatingStreams` empty and opens no real files;
    // the rotating-stream tests then inject fakes explicitly.
    process.env.CI = 'true';
    logger = new SoloPinoLogger('debug', true, new OneShotState());
    internals = internalsOf(logger);
    // flush() logs an info line first; keep it off the real pino destinations.
    infoStub = sinon.stub(logger, 'info');
  });

  afterEach((): void => {
    sinon.restore();
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
  });

  it('logs a flushing message before draining', (): void => {
    logger.flush((): void => {});

    expect(infoStub.calledWith('Flushing logs and exiting...')).to.be.true;
  });

  it('delegates to pino.flush when there are no rotating streams', (): void => {
    expect(internals.rotatingStreams).to.have.lengthOf(0);
    const pinoFlushStub: SinonStub = sinon.stub(internals.pinoLogger, 'flush');
    const callback: SinonStub = sinon.stub();

    logger.flush(callback);

    expect(pinoFlushStub.calledOnceWithExactly(callback)).to.be.true;
    // The callback is pino's responsibility on this path; flush() must not invoke it itself.
    expect(callback.called).to.be.false;
  });

  it('ends every rotating stream and invokes the callback only after all have closed', (): void => {
    const first: FakeStream = createFakeStream();
    const second: FakeStream = createFakeStream();
    internals.rotatingStreams.push(first, second);
    const callback: SinonStub = sinon.stub();

    logger.flush(callback);

    // Both streams are asked to drain and each has a single 'close' listener registered.
    expect(first.end.calledOnce).to.be.true;
    expect(second.end.calledOnce).to.be.true;
    expect(first.listenerCount('close')).to.equal(1);
    expect(second.listenerCount('close')).to.equal(1);

    first.emit('close');
    // One stream still open — the callback must wait.
    expect(callback.called).to.be.false;

    second.emit('close');
    expect(callback.calledOnce).to.be.true;
  });

  it('invokes the callback exactly once even if a stream emits close more than once', (): void => {
    const stream: FakeStream = createFakeStream();
    internals.rotatingStreams.push(stream);
    const callback: SinonStub = sinon.stub();

    logger.flush(callback);
    stream.emit('close');
    stream.emit('close');

    expect(callback.calledOnce).to.be.true;
  });

  describe('with fake timers', (): void => {
    let clock: SinonFakeTimers;

    beforeEach((): void => {
      clock = sinon.useFakeTimers();
    });

    afterEach((): void => {
      clock.restore();
    });

    it('invokes the callback via the safety timeout when a stream never closes', (): void => {
      const stream: FakeStream = createFakeStream();
      internals.rotatingStreams.push(stream);
      const callback: SinonStub = sinon.stub();

      logger.flush(callback);
      expect(callback.called).to.be.false;

      clock.tick(2000);

      expect(callback.calledOnce).to.be.true;
    });

    it('does not invoke the callback a second time when a stream closes after the timeout fired', (): void => {
      const stream: FakeStream = createFakeStream();
      internals.rotatingStreams.push(stream);
      const callback: SinonStub = sinon.stub();

      logger.flush(callback);
      clock.tick(2000);
      expect(callback.calledOnce).to.be.true;

      // A late 'close' after the timeout already settled must be ignored.
      stream.emit('close');

      expect(callback.calledOnce).to.be.true;
    });

    it('does not fire the safety timeout again after all streams closed normally', (): void => {
      const stream: FakeStream = createFakeStream();
      internals.rotatingStreams.push(stream);
      const callback: SinonStub = sinon.stub();

      logger.flush(callback);
      stream.emit('close');
      expect(callback.calledOnce).to.be.true;

      clock.tick(2000);

      expect(callback.calledOnce).to.be.true;
    });
  });
});

describe('SoloPinoLogger stream configuration', (): void => {
  let originalCi: string | undefined;

  beforeEach((): void => {
    originalCi = process.env.CI;
  });

  afterEach((): void => {
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
    sinon.restore();
  });

  it('registers rotating streams for flushing outside CI', (): void => {
    delete process.env.CI;
    const logger: SoloPinoLogger = new SoloPinoLogger('debug', true, new OneShotState());

    const internals: LoggerInternals = internalsOf(logger);
    // One NDJSON stream and one pretty stream are tracked for draining on exit.
    expect(internals.rotatingStreams).to.have.lengthOf(2);

    for (const stream of internals.rotatingStreams) {
      stream.end();
    }
  });

  it('tracks no streams to drain in CI (destinations are synchronous)', (): void => {
    process.env.CI = 'true';
    const logger: SoloPinoLogger = new SoloPinoLogger('debug', true, new OneShotState());

    expect(internalsOf(logger).rotatingStreams).to.have.lengthOf(0);
  });
});

// Typed view over the writability preflight, which runs before any stream is constructed.
type LoggerPreflight = {
  assertLogDestinationsWritable: (logsDirectory: string, fileNames: string[]) => void;
};

function preflightOf(): LoggerPreflight {
  return SoloPinoLogger as unknown as LoggerPreflight;
}

describe('SoloPinoLogger log destination preflight', (): void => {
  // chmod does not restrict writes on Windows, so the denial cases cannot be staged there.
  const canDenyWrites: boolean = process.platform !== 'win32';
  const fileNames: string[] = ['solo.ndjson', 'solo.log'];
  let logsDirectory: string;

  beforeEach((): void => {
    logsDirectory = PathEx.join(mkdtempSync(PathEx.join(tmpdir(), 'solo-logs-')), 'logs');
  });

  afterEach((): void => {
    // Restore write permission so the temporary tree can be cleaned up.
    chmodSync(logsDirectory, 0o700);
    for (const fileName of fileNames) {
      const filePath: string = PathEx.join(logsDirectory, fileName);
      if (existsSync(filePath)) {
        chmodSync(filePath, 0o600);
      }
    }
    rmSync(logsDirectory, {recursive: true, force: true});
  });

  it('creates the logs directory when it does not exist yet', (): void => {
    expect((): void => preflightOf().assertLogDestinationsWritable(logsDirectory, fileNames)).to.not.throw();
    expect(existsSync(logsDirectory)).to.be.true;
  });

  it('accepts a writable directory with writable existing log files', (): void => {
    mkdirSync(logsDirectory, {recursive: true});
    for (const fileName of fileNames) {
      writeFileSync(PathEx.join(logsDirectory, fileName), 'existing content\n');
    }

    expect((): void => preflightOf().assertLogDestinationsWritable(logsDirectory, fileNames)).to.not.throw();
  });

  (canDenyWrites ? it : it.skip)('rejects a logs directory that cannot be written', (): void => {
    mkdirSync(logsDirectory, {recursive: true});
    chmodSync(logsDirectory, 0o500);

    let thrown: SoloError | undefined;
    try {
      preflightOf().assertLogDestinationsWritable(logsDirectory, fileNames);
    } catch (error) {
      thrown = error as SoloError;
    }

    expect(thrown, 'expected the preflight to reject a read-only logs directory').to.be.instanceOf(SoloError);
    expect(thrown.getFormattedCode()).to.equal('SOLO-5082');
    expect(thrown.message).to.include(logsDirectory);
    // The errno reaches the message, so a permissions failure reads differently from a full disk.
    expect(thrown.message).to.include('EACCES');
  });

  (canDenyWrites ? it : it.skip)('rejects an existing log file that cannot be written', (): void => {
    // The reporter's case in issue #5370: the directory is fine, the log files are owned by root.
    mkdirSync(logsDirectory, {recursive: true});
    const lockedFile: string = PathEx.join(logsDirectory, 'solo.ndjson');
    writeFileSync(lockedFile, 'owned by another user\n');
    chmodSync(lockedFile, 0o400);

    let thrown: SoloError | undefined;
    try {
      preflightOf().assertLogDestinationsWritable(logsDirectory, fileNames);
    } catch (error) {
      thrown = error as SoloError;
    }

    expect(thrown, 'expected the preflight to reject a read-only log file').to.be.instanceOf(SoloError);
    expect(thrown.getFormattedCode()).to.equal('SOLO-5082');
    // The offending file is named, not just its directory, so the user knows what to chown.
    expect(thrown.message).to.include(lockedFile);
  });

  (canDenyWrites ? it : it.skip)('offers ownership and removal as recovery steps', (): void => {
    mkdirSync(logsDirectory, {recursive: true});
    chmodSync(logsDirectory, 0o500);

    let thrown: SoloError | undefined;
    try {
      preflightOf().assertLogDestinationsWritable(logsDirectory, fileNames);
    } catch (error) {
      thrown = error as SoloError;
    }

    const steps: string = (thrown.getTroubleshootingSteps() ?? []).join('\n');
    expect(steps).to.include('chown');
    expect(steps).to.include('rm -rf ~/.solo');
    expect(steps).to.include('SOLO_HOME');
    expect(thrown.cause).to.be.instanceOf(Error);
  });
});
