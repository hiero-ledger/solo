// SPDX-License-Identifier: Apache-2.0

export interface RttSample {
  transactionId: string;
  submitToMirrorMilliseconds: number;
  endToEndMilliseconds: number;
}
