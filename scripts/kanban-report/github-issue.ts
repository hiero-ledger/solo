// SPDX-License-Identifier: Apache-2.0

import {type GitHubLabel} from './github-label.js';
import {type GitHubUser} from './github-user.js';

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  pull_request?: unknown;
}
