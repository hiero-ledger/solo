// SPDX-License-Identifier: Apache-2.0

export interface GitHubPullRequest {
  number: number;
  created_at: string;
  state: 'open' | 'closed';
}
