// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import sinon, {type SinonSpy} from 'sinon';
import {expect} from 'chai';
import {describe, it, afterEach, beforeEach} from 'mocha';

import {type Logger as PinoLogger} from 'pino';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';

type LogMethod = 'error' | 'warn' | 'info' | 'debug';

describe('Logging', (): void => {
  let logger: SoloLogger;
  let errorSpy: SinonSpy;
  let warnSpy: SinonSpy;
  let infoSpy: SinonSpy;
  let debugSpy: SinonSpy;

  let spyByLevel: Record<LogMethod, SinonSpy>;

  beforeEach((): void => {
    logger = new SoloPinoLogger('debug', false) as SoloLogger;
    const pinoImpl: PinoLogger = (logger as any).pinoLogger;

    errorSpy = sinon.spy(pinoImpl, 'error');
    warnSpy = sinon.spy(pinoImpl, 'warn');
    infoSpy = sinon.spy(pinoImpl, 'info');
    debugSpy = sinon.spy(pinoImpl, 'debug');

    spyByLevel = {error: errorSpy, warn: warnSpy, info: infoSpy, debug: debugSpy};
  });

  // Cleanup after each test
  afterEach((): void => sinon.restore());

  it('should log at correct severity with traceId in meta', (): void => {
    expect(logger).to.be.instanceof(SoloPinoLogger);
    expect(logger).to.be.not.undefined;

    // Grab the active traceId from the logger’s meta
    const meta: {traceId?: string} = logger.prepMeta();
    const {traceId} = meta;
    expect(traceId).to.be.a('string');

    logger.error('Error log');
    expect(spyByLevel.error).to.have.been.calledWithMatch(sinon.match.has('traceId', traceId), 'Error log');

    logger.warn('Warn log');
    expect(spyByLevel.warn).to.have.been.calledWithMatch(sinon.match.has('traceId', traceId), 'Warn log');

    logger.info('Info log');
    expect(spyByLevel.info).to.have.been.calledWithMatch(sinon.match.has('traceId', traceId), 'Info log');

    logger.debug('Debug log');
    expect(spyByLevel.debug).to.have.been.calledWithMatch(sinon.match.has('traceId', traceId), 'Debug log');
  });
});
