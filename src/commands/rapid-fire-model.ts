// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';

export enum NlgResultStatus {
  Success = 'success',
  ZeroTps = 'zero-tps',
  NoResult = 'no-result',
  NoRttResult = 'no-rtt-result',
  RttThresholdExceeded = 'rtt-threshold-exceeded',
}

export type NlgResult = {
  status: NlgResultStatus;
  testClass: string;
  performanceTest: string;
  transactionCount?: number;
  durationSeconds?: number;
  tps?: number;
  rttMilliseconds?: number;
  maxRttMilliseconds?: number;
  hint?: string;
};

export type MirrorTransactionResponse = {
  transactions?: {transaction_id?: string}[];
};

export type RttSample = {
  transactionId: string;
  submitToMirrorMilliseconds: number;
  endToEndMilliseconds: number;
};

export type RttProbeResult = {
  samples: RttSample[];
  minMilliseconds: number;
  p50Milliseconds: number;
  p95Milliseconds: number;
  p99Milliseconds: number;
  maxMilliseconds: number;
};

export type RapidFireFailureDiagnostics = {
  context: string;
  namespace: NamespaceName;
  testClass: string;
  stdoutText: string;
  stderrText: string;
  result: NlgResult;
  execError?: Error;
};
