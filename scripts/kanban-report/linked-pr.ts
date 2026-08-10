// SPDX-License-Identifier: Apache-2.0

export interface LinkedPR {
  number: number;
  ageDays: number;
  state: 'open' | 'closed';
}
