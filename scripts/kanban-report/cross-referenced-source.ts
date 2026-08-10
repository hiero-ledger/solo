// SPDX-License-Identifier: Apache-2.0

export interface CrossReferencedSource {
  type: 'issue' | 'pull_request';
  issue: {
    number: number;
    pull_request?: unknown;
  };
}
