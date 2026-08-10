// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {type DevelopmentSummary} from './development-summary.js';
import {type IssueSummary} from './issue-summary.js';
import {type LinkedPR} from './linked-pr.js';

const COL_NUM: number = 5;
const COL_TITLE: number = 50;
const COL_ASSIGNEE: number = 16;
const COL_DAYS: number = 8;
const COL_PR: number = 12;

export class Formatter {
  public static header(repo: string, date: Date): string {
    const dateString: string = date.toISOString().slice(0, 10);
    const inner: string = `  KANBAN REPORT  ·  ${repo}  ·  ${dateString}  `;
    const border: string = '═'.repeat(inner.length);
    return chalk.bold.cyan(`╔${border}╗\n║${inner}║\n╚${border}╝`);
  }

  public static issueTable(rows: IssueSummary[], staleThresholdDays: number): string {
    if (rows.length === 0) {
      return chalk.dim('\nNo assigned open issues found.\n');
    }

    const sorted: IssueSummary[] = [...rows].toSorted(
      (a: IssueSummary, b: IssueSummary): number => b.netDays - a.netDays,
    );

    const headline: string = [
      '  ' + '#'.padEnd(COL_NUM),
      'Title'.padEnd(COL_TITLE),
      'Assignee'.padEnd(COL_ASSIGNEE),
      'Assigned'.padStart(COL_DAYS),
      'Blocked'.padStart(COL_DAYS),
      'Net'.padStart(COL_DAYS),
      'PR'.padEnd(COL_PR),
    ].join('  ');

    const divider: string =
      '  ' +
      '─'.repeat(COL_NUM) +
      '  ' +
      '─'.repeat(COL_TITLE) +
      '  ' +
      '─'.repeat(COL_ASSIGNEE) +
      '  ' +
      '─'.repeat(COL_DAYS) +
      '  ' +
      '─'.repeat(COL_DAYS) +
      '  ' +
      '─'.repeat(COL_DAYS) +
      '  ' +
      '─'.repeat(COL_PR);

    const lines: string[] = [
      chalk.bold('\nOPEN ISSUES — assigned, sorted by net days (oldest first)\n'),
      chalk.dim(headline),
      chalk.dim(divider),
    ];

    for (const row of sorted) {
      lines.push(Formatter.issueRow(row, staleThresholdDays));
    }

    lines.push(chalk.dim('\n  Legend: ⚠ stale (net > ' + staleThresholdDays + 'd)  ·  [BLOCKED] = currently blocked'));

    return lines.join('\n');
  }

  private static issueRow(row: IssueSummary, staleThresholdDays: number): string {
    const isStale: boolean = row.netDays >= staleThresholdDays;

    const numberCol: string = String(row.issueNumber).padEnd(COL_NUM);
    const rawTitle: string = row.title.length > COL_TITLE ? row.title.slice(0, COL_TITLE - 1) + '…' : row.title;
    const titleCol: string = rawTitle.padEnd(COL_TITLE);
    const assigneeCol: string = ('@' + row.assignee).padEnd(COL_ASSIGNEE);
    const assignedCol: string = (row.assignedDays + 'd').padStart(COL_DAYS);
    const blockedCol: string = (row.blockedDays + 'd').padStart(COL_DAYS);
    const netCol: string = (row.netDays + 'd').padStart(COL_DAYS);

    const staleMarker: string = isStale ? chalk.yellow(' ⚠') : '';
    const prText: string = Formatter.formatPrColumn(row);

    const coloredAssignee: string = chalk.cyan(assigneeCol);
    const coloredNet: string = isStale ? chalk.yellow(netCol) : netCol;

    return (
      '  ' +
      numberCol +
      '  ' +
      titleCol +
      '  ' +
      coloredAssignee +
      '  ' +
      assignedCol +
      '  ' +
      blockedCol +
      '  ' +
      coloredNet +
      staleMarker +
      '  ' +
      prText
    );
  }

  private static formatPrColumn(row: IssueSummary): string {
    if (row.linkedPrs.length > 0) {
      const parts: string[] = row.linkedPrs.map(
        (linkedPr: LinkedPR): string => `#${linkedPr.number} · ${linkedPr.ageDays}d`,
      );
      return parts.join(', ');
    }
    if (row.isCurrentlyBlocked) {
      return chalk.yellow('[BLOCKED]');
    }
    return '';
  }

  public static closedIssueTable(rows: IssueSummary[], closedDays: number): string {
    if (rows.length === 0) {
      return chalk.dim(`\nNo assigned issues closed in the last ${closedDays}d.\n`);
    }

    const sorted: IssueSummary[] = [...rows].toSorted((a: IssueSummary, b: IssueSummary): number => {
      const aTime: number = a.closedAt?.getTime() ?? 0;
      const bTime: number = b.closedAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    const COL_CLOSED: number = 10;

    const headline: string = [
      '  ' + '#'.padEnd(COL_NUM),
      'Title'.padEnd(COL_TITLE),
      'Assignee'.padEnd(COL_ASSIGNEE),
      'Assigned'.padStart(COL_DAYS),
      'Blocked'.padStart(COL_DAYS),
      'Net'.padStart(COL_DAYS),
      'Closed'.padStart(COL_CLOSED),
    ].join('  ');

    const divider: string =
      '  ' +
      '─'.repeat(COL_NUM) +
      '  ' +
      '─'.repeat(COL_TITLE) +
      '  ' +
      '─'.repeat(COL_ASSIGNEE) +
      '  ' +
      '─'.repeat(COL_DAYS) +
      '  ' +
      '─'.repeat(COL_DAYS) +
      '  ' +
      '─'.repeat(COL_DAYS) +
      '  ' +
      '─'.repeat(COL_CLOSED);

    const lines: string[] = [
      chalk.bold(`\nCLOSED ISSUES — last ${closedDays}d, sorted by close date (newest first)\n`),
      chalk.dim(headline),
      chalk.dim(divider),
    ];

    const msDayFactor: number = 1000 * 60 * 60 * 24;
    const now: Date = new Date();

    for (const row of sorted) {
      const numberCol: string = String(row.issueNumber).padEnd(COL_NUM);
      const rawTitle: string = row.title.length > COL_TITLE ? row.title.slice(0, COL_TITLE - 1) + '…' : row.title;
      const titleCol: string = rawTitle.padEnd(COL_TITLE);
      const assigneeCol: string = chalk.cyan(('@' + row.assignee).padEnd(COL_ASSIGNEE));
      const assignedCol: string = (row.assignedDays + 'd').padStart(COL_DAYS);
      const blockedCol: string = (row.blockedDays + 'd').padStart(COL_DAYS);
      const netCol: string = (row.netDays + 'd').padStart(COL_DAYS);

      const closedAgoText: string = row.closedAt
        ? Math.floor((now.getTime() - row.closedAt.getTime()) / msDayFactor) + 'd ago'
        : '—';
      const closedCol: string = chalk.green(closedAgoText.padStart(COL_CLOSED));

      lines.push(
        '  ' +
          numberCol +
          '  ' +
          titleCol +
          '  ' +
          assigneeCol +
          '  ' +
          assignedCol +
          '  ' +
          blockedCol +
          '  ' +
          netCol +
          '  ' +
          closedCol,
      );
    }

    return lines.join('\n');
  }

  public static devSummaryTable(
    summaries: DevelopmentSummary[],
    staleThresholdDays: number,
    closedDays: number,
  ): string {
    const COL_DEV: number = 16;
    const COL_OPEN: number = 5;
    const COL_AVG_NET: number = 8;
    const COL_STALE: number = 12;
    const COL_BLOCKED: number = 8;
    const COL_PRS: number = 8;
    const COL_CLOSED: number = 10;

    const staleHeader: string = `Stale(>${staleThresholdDays}d)`;
    const closedHeader: string = `Closed(${closedDays}d)`;

    const headline: string = [
      '  ' + 'Developer'.padEnd(COL_DEV),
      'Open'.padStart(COL_OPEN),
      'Avg Net'.padStart(COL_AVG_NET),
      staleHeader.padStart(COL_STALE),
      'Blocked'.padStart(COL_BLOCKED),
      'PRs Open'.padStart(COL_PRS),
      closedHeader.padStart(COL_CLOSED),
    ].join('  ');

    const divider: string =
      '  ' +
      '─'.repeat(COL_DEV) +
      '  ' +
      '─'.repeat(COL_OPEN) +
      '  ' +
      '─'.repeat(COL_AVG_NET) +
      '  ' +
      '─'.repeat(COL_STALE) +
      '  ' +
      '─'.repeat(COL_BLOCKED) +
      '  ' +
      '─'.repeat(COL_PRS) +
      '  ' +
      '─'.repeat(COL_CLOSED);

    const lines: string[] = [chalk.bold('\nDEVELOPER SUMMARY\n'), chalk.dim(headline), chalk.dim(divider)];

    for (const developmentSummary of summaries) {
      const developmentCol: string = ('@' + developmentSummary.login).padEnd(COL_DEV);
      const openCol: string = String(developmentSummary.openCount).padStart(COL_OPEN);
      const avgNetCol: string = (developmentSummary.avgNetDays + 'd').padStart(COL_AVG_NET);
      const staleCol: string = String(developmentSummary.staleCount).padStart(COL_STALE);
      const blockedCol: string = String(developmentSummary.blockedCount).padStart(COL_BLOCKED);
      const prsCol: string = String(developmentSummary.openPrCount).padStart(COL_PRS);
      const closedCol: string = chalk.green(String(developmentSummary.closedCount).padStart(COL_CLOSED));

      lines.push(
        '  ' +
          developmentCol +
          '  ' +
          openCol +
          '  ' +
          avgNetCol +
          '  ' +
          staleCol +
          '  ' +
          blockedCol +
          '  ' +
          prsCol +
          '  ' +
          closedCol,
      );
    }

    return lines.join('\n');
  }

  public static footer(
    openCount: number,
    staleCount: number,
    blockedCount: number,
    closedCount: number,
    closedDays: number,
    elapsedMs: number,
    timelineCount: number,
    prCount: number,
    cacheHits: number,
    authStatus: string,
  ): string {
    const divider: string = chalk.dim('─'.repeat(72));
    const elapsed: string = (elapsedMs / 1000).toFixed(1);
    const closedSuffix: string = closedCount > 0 ? `  ·  ${closedCount} closed (last ${closedDays}d)` : '';
    const statsLine: string = `  ${openCount} open assigned  ·  ${staleCount} stale  ·  ${blockedCount} blocked${closedSuffix}`;
    const prSuffix: string = prCount > 0 ? ` + ${prCount} PR${prCount === 1 ? '' : 's'}` : '';
    const cacheSuffix: string = cacheHits > 0 ? `, ${cacheHits} cached` : '';
    const perfLine: string = chalk.dim(
      `  Fetched in ${elapsed}s (${timelineCount} timeline${timelineCount === 1 ? '' : 's'}${prSuffix}${cacheSuffix})  ·  ${authStatus}`,
    );
    return `\n${divider}\n${statsLine}\n${perfLine}\n${divider}\n`;
  }
}
