// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {RapidFireCommand} from '../../../src/commands/rapid-fire.js';

interface NlgResultForTest {
  status: string;
  testClass: string;
  performanceTest: string;
  transactionCount?: number;
  durationSeconds?: number;
  tps?: number;
  rttMilliseconds?: number;
  maxRttMilliseconds?: number;
}

interface RapidFireCommandInternals {
  analyzeNlgOutput(
    output: string,
    testClass: string,
    performanceTest: string,
    maxRttMilliseconds?: number,
  ): NlgResultForTest;
}

describe('RapidFireCommand', (): void => {
  const internals: RapidFireCommandInternals = RapidFireCommand as unknown as RapidFireCommandInternals;
  const performanceTest: string = 'TokenTransferLoadTest';
  const testClass: string = `com.hedera.benchmark.${performanceTest}`;

  describe('analyzeNlgOutput', (): void => {
    it('returns success when end-to-end mirror RTT is below the configured threshold', (): void => {
      const output: string = [
        'Max end-to-end mirror RTT: 499 ms',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest, 500);

      expect(result.status).to.equal('success');
      expect(result.rttMilliseconds).to.equal(499);
    });

    it('returns rtt-threshold-exceeded when RTT is above the configured threshold', (): void => {
      const output: string = [
        'End to end mirror round trip time: 501 milliseconds',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest, 500);

      expect(result.status).to.equal('rtt-threshold-exceeded');
      expect(result.rttMilliseconds).to.equal(501);
      expect(result.maxRttMilliseconds).to.equal(500);
    });

    it('returns no-rtt-result when a threshold is configured and no RTT is reported', (): void => {
      const output: string = 'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10';

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest, 500);

      expect(result.status).to.equal('no-rtt-result');
      expect(result.maxRttMilliseconds).to.equal(500);
    });

    it('converts seconds to milliseconds before comparing RTT', (): void => {
      const output: string = [
        'P95 end-to-end mirror round trip time: 0.6 seconds',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest, 500);

      expect(result.status).to.equal('rtt-threshold-exceeded');
      expect(result.rttMilliseconds).to.equal(600);
    });

    it('parses RTT output when the unit appears before the value', (): void => {
      const output: string = [
        'Max mirror RTT (ms): 501',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest, 500);

      expect(result.status).to.equal('rtt-threshold-exceeded');
      expect(result.rttMilliseconds).to.equal(501);
    });

    it('does not accept a consensus-only RTT as the roadmap RTT result', (): void => {
      const output: string = [
        'Consensus RTT: 499 ms',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest, 500);

      expect(result.status).to.equal('no-rtt-result');
      expect(result.maxRttMilliseconds).to.equal(500);
    });

    it('keeps existing success behavior when no RTT threshold is configured', (): void => {
      const output: string = 'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10';

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal('success');
      expect(result.rttMilliseconds).to.equal(undefined);
    });
  });
});
