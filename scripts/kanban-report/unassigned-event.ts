// SPDX-License-Identifier: Apache-2.0

import {type GitHubUser} from './github-user.js';

export interface UnassignedEvent {
  event: 'unassigned';
  created_at: string;
  assignee: GitHubUser;
}
