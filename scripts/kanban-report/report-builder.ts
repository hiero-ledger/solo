// SPDX-License-Identifier: Apache-2.0

import {type DevelopmentSummary} from './development-summary.js';
import {type IssueSummary} from './issue-summary.js';

type DevelopmentAccumulator = {
  dev: DevelopmentSummary;
  totalNetDays: number;
  openPrNumbers: Set<number>;
};

export class ReportBuilder {
  public static buildDevSummaries(
    openSummaries: IssueSummary[],
    closedSummaries: IssueSummary[],
    staleThresholdDays: number,
  ): DevelopmentSummary[] {
    const accumMap: Map<string, DevelopmentAccumulator> = new Map<string, DevelopmentAccumulator>();

    for (const summary of openSummaries) {
      let accumulator: DevelopmentAccumulator | undefined = accumMap.get(summary.assignee);
      if (!accumulator) {
        accumulator = {
          dev: {
            login: summary.assignee,
            openCount: 0,
            avgNetDays: 0,
            staleCount: 0,
            blockedCount: 0,
            openPrCount: 0,
            closedCount: 0,
          },
          totalNetDays: 0,
          openPrNumbers: new Set<number>(),
        };
        accumMap.set(summary.assignee, accumulator);
      }

      accumulator.dev.openCount++;
      accumulator.totalNetDays += summary.netDays;
      if (summary.netDays >= staleThresholdDays) {
        accumulator.dev.staleCount++;
      }
      if (summary.isCurrentlyBlocked) {
        accumulator.dev.blockedCount++;
      }
      for (const linkedPr of summary.linkedPrs) {
        if (linkedPr.state === 'open') {
          accumulator.openPrNumbers.add(linkedPr.number);
        }
      }
    }

    // Ensure every developer who closed issues appears even if they have no open issues
    for (const summary of closedSummaries) {
      let accumulator: DevelopmentAccumulator | undefined = accumMap.get(summary.assignee);
      if (!accumulator) {
        accumulator = {
          dev: {
            login: summary.assignee,
            openCount: 0,
            avgNetDays: 0,
            staleCount: 0,
            blockedCount: 0,
            openPrCount: 0,
            closedCount: 0,
          },
          totalNetDays: 0,
          openPrNumbers: new Set<number>(),
        };
        accumMap.set(summary.assignee, accumulator);
      }
      accumulator.dev.closedCount++;
    }

    const result: DevelopmentSummary[] = [];
    for (const {dev, totalNetDays, openPrNumbers} of accumMap.values()) {
      dev.avgNetDays = dev.openCount > 0 ? Math.round(totalNetDays / dev.openCount) : 0;
      dev.openPrCount = openPrNumbers.size;
      result.push(dev);
    }

    return result.toSorted(
      (a: DevelopmentSummary, b: DevelopmentSummary): number =>
        b.openCount - a.openCount || b.avgNetDays - a.avgNetDays,
    );
  }
}
