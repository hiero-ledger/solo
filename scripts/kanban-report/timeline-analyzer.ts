// SPDX-License-Identifier: Apache-2.0

import {type AssignedEvent} from './assigned-event.js';
import {type BlockedInterval} from './blocked-interval.js';
import {type CrossReferencedEvent} from './cross-referenced-event.js';
import {type GitHubIssue} from './github-issue.js';
import {type IssueSummary} from './issue-summary.js';
import {type LabeledEvent} from './labeled-event.js';
import {type TimelineEvent} from './timeline-event.js';
import {type UnassignedEvent} from './unassigned-event.js';
import {type UnlabeledEvent} from './unlabeled-event.js';

const MS_PER_DAY: number = 1000 * 60 * 60 * 24;
const BLOCKED_LABEL: string = 'blocked';

export class TimelineAnalyzer {
  public static analyze(issue: GitHubIssue, events: TimelineEvent[], endDate: Date): IssueSummary[] {
    const lastAssignedAt: Map<string, Date> = new Map();
    const blockedIntervals: BlockedInterval[] = [];
    let blockedStart: Date | null = null;
    const linkedPrNumbers: number[] = [];

    for (const event of events) {
      switch (event.event) {
        case 'assigned': {
          const assigned: AssignedEvent = event as AssignedEvent;
          // Resets any previous assignment streak for this login
          lastAssignedAt.set(assigned.assignee.login, new Date(assigned.created_at));
          break;
        }
        case 'unassigned': {
          const unassigned: UnassignedEvent = event as UnassignedEvent;
          lastAssignedAt.delete(unassigned.assignee.login);
          break;
        }
        case 'labeled': {
          const labeled: LabeledEvent = event as LabeledEvent;
          if (labeled.label.name === BLOCKED_LABEL && blockedStart === null) {
            blockedStart = new Date(labeled.created_at);
          }
          break;
        }
        case 'unlabeled': {
          const unlabeled: UnlabeledEvent = event as UnlabeledEvent;
          if (unlabeled.label.name === BLOCKED_LABEL && blockedStart !== null) {
            blockedIntervals.push({start: blockedStart, end: new Date(unlabeled.created_at)});
            blockedStart = null;
          }
          break;
        }
        case 'cross-referenced': {
          const crossReference: CrossReferencedEvent = event as CrossReferencedEvent;
          // source.issue.pull_request being present means the cross-reference is from a PR
          if (crossReference.source.issue.pull_request !== undefined) {
            linkedPrNumbers.push(crossReference.source.issue.number);
          }
          break;
        }
        default: {
          break;
        }
      }
    }

    // If the issue is still blocked at endDate, close the interval there
    if (blockedStart !== null) {
      blockedIntervals.push({start: blockedStart, end: endDate});
    }

    const isCurrentlyBlocked: boolean = blockedStart !== null;
    const closedAt: Date | undefined = issue.state === 'closed' ? endDate : undefined;

    const summaries: IssueSummary[] = [];

    for (const assignee of issue.assignees) {
      const assignedAt: Date | undefined = lastAssignedAt.get(assignee.login);
      if (!assignedAt) {
        // No recorded 'assigned' event for this login in the timeline.
        // This can happen when an issue was assigned before GitHub began recording timeline events,
        // or via the API without triggering a timeline event. Skip to avoid showing 0-day entries.
        continue;
      }

      const assignedMs: number = endDate.getTime() - assignedAt.getTime();
      const assignedDays: number = Math.floor(assignedMs / MS_PER_DAY);

      // Sum blocked time only within this assignee's current assignment window [assignedAt, endDate]
      let blockedMs: number = 0;
      for (const interval of blockedIntervals) {
        const overlapStart: number = Math.max(interval.start.getTime(), assignedAt.getTime());
        const overlapEnd: number = Math.min(interval.end.getTime(), endDate.getTime());
        if (overlapEnd > overlapStart) {
          blockedMs += overlapEnd - overlapStart;
        }
      }
      const blockedDays: number = Math.floor(blockedMs / MS_PER_DAY);
      const netDays: number = Math.max(0, assignedDays - blockedDays);

      summaries.push({
        issueNumber: issue.number,
        title: issue.title,
        assignee: assignee.login,
        assignedDays,
        blockedDays,
        netDays,
        isCurrentlyBlocked,
        linkedPrNumbers,
        linkedPrs: [],
        closedAt,
      });
    }

    return summaries;
  }
}
