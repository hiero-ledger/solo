// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import {OneShotState} from '../../../../src/core/one-shot-state.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {type SoloError} from '../../../../src/core/errors/solo-error.js';

function lineLogged(stub: SinonStub, substring: string): boolean {
  return stub.getCalls().some((call): boolean => String(call.args[0]).includes(substring));
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
