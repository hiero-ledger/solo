// SPDX-License-Identifier: Apache-2.0

export enum NlgResultStatus {
  SUCCESS = 'success',
  ZERO_TPS = 'zero-tps',
  NO_RESULT = 'no-result',
  NO_RTT_RESULT = 'no-rtt-result',
  RTT_THRESHOLD_EXCEEDED = 'rtt-threshold-exceeded',
}
