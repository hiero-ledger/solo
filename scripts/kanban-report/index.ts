// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {GithubCache} from './cache.js';
import {GithubClient} from './github-client.js';
import {Formatter} from './formatter.js';
import {ReportBuilder} from './report-builder.js';
import {TimelineAnalyzer} from './timeline-analyzer.js';
import {type GitHubIssue} from './github-issue.js';
import {type GitHubPullRequest} from './github-pull-request.js';
import {type IssueSummary} from './issue-summary.js';
import {type LinkedPR} from './linked-pr.js';
import {type ReportConfig} from './report-config.js';
import {type TimelineEvent} from './timeline-event.js';
import {type DevelopmentSummary} from './development-summary.js';

const MS_PER_DAY: number = 1000 * 60 * 60 * 24;

class KanbanReport {
  public static async run(): Promise<void> {
    const startTime: number = Date.now();
    const config: ReportConfig = KanbanReport.parseArgs();
    const now: Date = new Date();

    const cache: GithubCache = GithubCache.load();
    const client: GithubClient = new GithubClient(config.repo, cache);

    process.stdout.write(Formatter.header(config.repo, now) + '\n');

    // ── Open issues ──────────────────────────────────────────────────────────

    process.stderr.write(chalk.dim('  Fetching open issues...\r'));
    const allIssues: GitHubIssue[] = await client.getIssues('open');

    const issues: GitHubIssue[] = allIssues.filter(
      (issue: GitHubIssue): boolean => issue.pull_request === undefined && issue.assignees.length > 0,
    );

    process.stderr.write(chalk.dim(`  Fetching ${issues.length} timelines...          \r`));

    const openSummaries: IssueSummary[] = [];
    for (const issue of issues) {
      const events: TimelineEvent[] = await client.getTimeline(issue.number);
      const issueSummaries: IssueSummary[] = TimelineAnalyzer.analyze(issue, events, now);
      openSummaries.push(...issueSummaries);
      process.stderr.write(chalk.dim(`  Fetched ${openSummaries.length} / ${issues.length} timelines...\r`));
    }

    // ── Closed issues ────────────────────────────────────────────────────────

    const closedSummaries: IssueSummary[] = [];
    if (config.showClosed) {
      const since: Date = new Date(now.getTime() - config.closedDays * MS_PER_DAY);
      process.stderr.write(chalk.dim('  Fetching closed issues...\r'));
      const allClosedIssues: GitHubIssue[] = await client.getIssues('closed', since);

      const closedIssues: GitHubIssue[] = allClosedIssues.filter(
        (issue: GitHubIssue): boolean =>
          issue.pull_request === undefined &&
          issue.assignees.length > 0 &&
          issue.closed_at !== null &&
          new Date(issue.closed_at) >= since,
      );

      if (closedIssues.length > 0) {
        process.stderr.write(chalk.dim(`  Fetching ${closedIssues.length} closed timelines...          \r`));
        for (const issue of closedIssues) {
          const events: TimelineEvent[] = await client.getTimeline(issue.number);
          const endDate: Date = issue.closed_at ? new Date(issue.closed_at) : now;
          const issueSummaries: IssueSummary[] = TimelineAnalyzer.analyze(issue, events, endDate);
          closedSummaries.push(...issueSummaries);
          process.stderr.write(
            chalk.dim(`  Fetched ${closedSummaries.length} / ${closedIssues.length} closed timelines...\r`),
          );
        }
      }
    }

    // ── Linked PRs ───────────────────────────────────────────────────────────

    const allSummaries: IssueSummary[] = [...openSummaries, ...closedSummaries];
    const allLinkedPrNumbers: Set<number> = new Set<number>();
    for (const summary of allSummaries) {
      for (const prNumber of summary.linkedPrNumbers) {
        allLinkedPrNumbers.add(prNumber);
      }
    }

    if (allLinkedPrNumbers.size > 0) {
      process.stderr.write(
        chalk.dim(
          `  Fetching ${allLinkedPrNumbers.size} linked PR${allLinkedPrNumbers.size === 1 ? '' : 's'}...          \r`,
        ),
      );
    }
    const pullRequestFetches: Promise<GitHubPullRequest | null>[] = [...allLinkedPrNumbers].map(
      (prNumber: number): Promise<GitHubPullRequest | null> => client.getPull(prNumber),
    );
    const fetchedPullRequests: GitHubPullRequest[] = (await Promise.all(pullRequestFetches)).filter(
      (pr: GitHubPullRequest | null): pr is GitHubPullRequest => pr !== null,
    );

    const linkedPrMap: Map<number, LinkedPR> = new Map<number, LinkedPR>();
    for (const pullRequest of fetchedPullRequests) {
      const ageDays: number = Math.floor((now.getTime() - new Date(pullRequest.created_at).getTime()) / MS_PER_DAY);
      linkedPrMap.set(pullRequest.number, {number: pullRequest.number, ageDays, state: pullRequest.state});
    }

    for (const summary of allSummaries) {
      summary.linkedPrs = summary.linkedPrNumbers
        .map((prNumber: number): LinkedPR | undefined => linkedPrMap.get(prNumber))
        .filter((linkedPr: LinkedPR | undefined): linkedPr is LinkedPR => linkedPr !== undefined);
    }

    // Clear the progress line
    process.stderr.write('                                                  \r');

    // ── Output ───────────────────────────────────────────────────────────────

    process.stdout.write(Formatter.issueTable(openSummaries, config.staleThresholdDays) + '\n');

    if (config.showClosed) {
      process.stdout.write(Formatter.closedIssueTable(closedSummaries, config.closedDays) + '\n');
    }

    const developmentSummaries: DevelopmentSummary[] = ReportBuilder.buildDevSummaries(
      openSummaries,
      closedSummaries,
      config.staleThresholdDays,
    );
    process.stdout.write(
      Formatter.devSummaryTable(developmentSummaries, config.staleThresholdDays, config.closedDays) + '\n',
    );

    cache.save();

    const staleCount: number = openSummaries.filter(
      (summary: IssueSummary): boolean => summary.netDays >= config.staleThresholdDays,
    ).length;
    const blockedCount: number = openSummaries.filter(
      (summary: IssueSummary): boolean => summary.isCurrentlyBlocked,
    ).length;
    const totalTimelineCount: number = issues.length + (config.showClosed ? closedSummaries.length : 0);

    process.stdout.write(
      Formatter.footer(
        openSummaries.length,
        staleCount,
        blockedCount,
        closedSummaries.length,
        config.closedDays,
        Date.now() - startTime,
        totalTimelineCount,
        allLinkedPrNumbers.size,
        cache.hits,
        client.authStatus,
      ),
    );
  }

  private static parseArgs(): ReportConfig {
    const arguments_: string[] = process.argv.slice(2);
    let repo: string = 'hiero-ledger/solo';
    let staleThresholdDays: number = 21;
    let closedDays: number = 14;
    let showClosed: boolean = true;

    for (let index: number = 0; index < arguments_.length; index++) {
      const argument: string = arguments_[index];
      if ((argument === '--repo' || argument === '-r') && arguments_[index + 1]) {
        repo = arguments_[++index];
      } else if (argument === '--stale-days' && arguments_[index + 1]) {
        staleThresholdDays = Number.parseInt(arguments_[++index], 10);
      } else if (argument === '--closed-days' && arguments_[index + 1]) {
        closedDays = Number.parseInt(arguments_[++index], 10);
      } else if (argument === '--no-closed') {
        showClosed = false;
      } else if (argument === '--help' || argument === '-h') {
        KanbanReport.printHelp();
        // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
        process.exit(0);
      }
    }

    return {repo, staleThresholdDays, closedDays, showClosed};
  }

  private static printHelp(): void {
    process.stdout.write(`Usage: npx tsx scripts/kanban-report/index.ts [options]

Options:
  --repo, -r <owner/repo>   Repository to report on (default: hiero-ledger/solo)
  --stale-days <N>          Days before an issue is considered stale (default: 21)
  --closed-days <N>         Days back to look for closed issues (default: 14)
  --no-closed               Skip the closed issues section
  --help, -h                Show this help message

GitHub API responses are cached in ~/.solo/kanban-cache.json (ETag-based, 7-day TTL).
`);
  }
}

try {
  await KanbanReport.run();
} catch (error: unknown) {
  console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
  // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
  process.exit(1);
}
