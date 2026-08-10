// SPDX-License-Identifier: Apache-2.0

import {type GitHubLabel} from './github-label.js';

export interface LabeledEvent {
  event: 'labeled';
  created_at: string;
  label: GitHubLabel;
}
