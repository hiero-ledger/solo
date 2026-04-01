// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import fs from 'node:fs';
import os from 'node:os';
import {ShellRunner} from '../../core/shell-runner.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {PathEx} from '../../business/utils/path-ex.js';
import * as constants from '../../core/constants.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

/** Options for building a GitHub issue body from diagnostic information. */
export type DiagnosticsIssueBodyOptions = {
  soloVersion: string;
  deployment: string;
  timestamp: string;
  /** Absolute path to the debug zip archive, if one was created. */
  zipFilePath?: string;
};

/**
 * Utility class for the `deployment diagnostics report` command.
 * Handles gh CLI availability checks, issue body assembly, and issue creation.
 */
export class DiagnosticsReporter {
  /**
   * Checks whether the GitHub CLI (`gh`) is available on the system PATH.
   * @returns true if `gh` is installed and reachable, false otherwise
   */
  public static async isGhCliAvailable(logger: SoloLogger): Promise<boolean> {
    try {
      const shellRunner: ShellRunner = new ShellRunner(logger);
      const command: string = os.platform() === 'win32' ? 'where' : 'which';
      await shellRunner.run(command, ['gh']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Searches for the most recently modified debug zip archive that was created
   * at or after `afterTimestampMs` in the given directory.
   *
   * The `deployment diagnostics debug` command writes files named
   * `solo-debug-<deployment>-<timestamp>.zip` one level above the logs directory.
   *
   * @param searchDirectory  Directory to search (typically `~/.solo`).
   * @param deployment       Deployment name used as part of the filename prefix.
   * @param afterTimestampMs Milliseconds epoch; only files modified at or after
   *                         this time are considered.
   * @returns The absolute path to the found zip, or `undefined` if none matched.
   */
  public static findLatestDebugZip(
    searchDirectory: string,
    deployment: string,
    afterTimestampMs: number,
  ): string | undefined {
    if (!fs.existsSync(searchDirectory)) {
      return undefined;
    }

    const prefix: string = `solo-debug-${deployment}-`;
    const candidates: {filePath: string; mtime: number}[] = fs
      .readdirSync(searchDirectory)
      .filter(file => file.startsWith(prefix) && file.endsWith('.zip'))
      .map(file => {
        const filePath: string = PathEx.join(searchDirectory, file);
        const mtime: number = fs.statSync(filePath).mtimeMs;
        return {filePath, mtime};
      })
      .filter(({mtime}) => mtime >= afterTimestampMs)
      // eslint-disable-next-line unicorn/no-array-sort
      .sort((a, b) => b.mtime - a.mtime);

    return candidates.length > 0 ? candidates[0].filePath : undefined;
  }

  /**
   * Reads the diagnostics-analysis.txt file from the logs directory, if present.
   * @param logsDirectory  Directory where the analysis file is expected.
   * @returns File contents, or an empty string if the file does not exist.
   */
  public static readAnalysisContent(logsDirectory: string): string {
    const analysisFilePath: string = PathEx.join(logsDirectory, 'diagnostics-analysis.txt');
    if (fs.existsSync(analysisFilePath)) {
      return fs.readFileSync(analysisFilePath, 'utf8');
    }
    return '';
  }

  /**
   * Assembles the Markdown body for a GitHub issue from the provided diagnostic
   * information.
   */
  public static buildIssueBody(options: DiagnosticsIssueBodyOptions): string {
    const {soloVersion, deployment, timestamp, zipFilePath} = options;
    const analysisContent: string = DiagnosticsReporter.readAnalysisContent(constants.SOLO_LOGS_DIR);

    const lines: string[] = [
      '## Solo Diagnostic Report',
      '',
      `- **Solo Version**: ${soloVersion}`,
      `- **Deployment**: ${deployment || '(not specified)'}`,
      `- **Timestamp**: ${timestamp}`,
      `- **Platform**: ${os.platform()} ${os.release()}`,
      `- **Node.js**: ${process.version}`,
      `- **Diagnostic logs**: ${constants.SOLO_LOGS_DIR}`,
    ];

    if (zipFilePath) {
      lines.push(`- **Debug archive**: ${zipFilePath}`);
    }

    lines.push(
      '',
      '## Diagnostics Analysis',
      '',
      analysisContent ? '```\n' + analysisContent + '\n```' : '_No analysis available_',
      '',
      '## Description',
      '',
      '_Please describe the issue you encountered..._',
      '',
      '## Steps to Reproduce',
      '',
      '_Please list the steps to reproduce the issue..._',
    );

    if (zipFilePath) {
      lines.push(
        '',
        '---',
        `_Note: A debug archive was generated at \`${zipFilePath}\`. Please attach it to this issue via the GitHub web interface._`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Creates a GitHub issue using the `gh` CLI with the supplied title and body.
   * If a zip archive path is provided, the user is reminded to attach it manually
   * since the GitHub Issues API does not support binary attachments.
   *
   * @param logger       Logger for user-facing output.
   * @param title        Issue title.
   * @param body         Issue body in Markdown.
   * @param zipFilePath  Optional path to the debug zip archive to mention.
   * @returns The URL of the newly created issue, or an empty string if not found.
   */
  public static async createGitHubIssue(
    logger: SoloLogger,
    title: string,
    body: string,
    zipFilePath?: string,
  ): Promise<string> {
    const shellRunner: ShellRunner = new ShellRunner(logger);
    try {
      const output: string[] = await shellRunner.run('gh', [
        'issue',
        'create',
        '--repo',
        'hiero-ledger/solo',
        '--title',
        title,
        '--body',
        body,
      ]);

      const issueUrl: string = output.find(line => line.startsWith('https://')) ?? output.at(-1) ?? '';
      logger.showUser(chalk.green('\n✓ GitHub issue created successfully!'));
      if (issueUrl) {
        logger.showUser(chalk.cyan(`  Issue URL: ${issueUrl}`));
      }
      logger.showUser(chalk.cyan(`  Diagnostic logs: ${constants.SOLO_LOGS_DIR}`));

      if (zipFilePath && fs.existsSync(zipFilePath)) {
        logger.showUser(chalk.cyan(`  Debug archive: ${zipFilePath}`));
        logger.showUser(chalk.yellow('  Please attach the debug archive to the issue via the GitHub web interface.'));
      }

      return issueUrl;
    } catch (error: Error | unknown) {
      throw new SoloError(`Failed to create GitHub issue: ${(error as Error).message}`, error as Error);
    }
  }
}
