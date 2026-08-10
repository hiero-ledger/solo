// SPDX-License-Identifier: Apache-2.0

import {type LinkedPR} from './linked-pr.js';

export interface IssueSummary {
  issueNumber: number;
  title: string;
  assignee: string;
  assignedDays: number;
  blockedDays: number;
  netDays: number;
  isCurrentlyBlocked: boolean;
  linkedPrNumbers: number[];
  linkedPrs: LinkedPR[];
  closedAt?: Date;
}
