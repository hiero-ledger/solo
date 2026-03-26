// SPDX-License-Identifier: Apache-2.0

import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

const {green, yellow} = chalk;

/**
 * Severity-ordered categories for diagnostics findings.
 *
 * Ordering (lowest value = highest severity in the report):
 *   1. image-pull       — container image could not be pulled; pod will never start.
 *   2. oom              — container was killed by the kernel due to memory exhaustion.
 *   3. pod-readiness    — pod is not Running or its readiness probe is failing.
 *   4. consensus-active — consensus node did not reach ACTIVE platform status.
 *   5. log-exception    — an exception/stack-trace was found in an application log.
 */
export type DiagnosticsFindingCategory = 'image-pull' | 'oom' | 'pod-readiness' | 'consensus-active' | 'log-exception';

/** A single detected problem with its supporting evidence lines. */
export type DiagnosticsFinding = {
  category: DiagnosticsFindingCategory;
  title: string;
  /** Relative path of the source file (or "archive:entry") that triggered this finding. */
  source: string;
  /** Up to 14 verbatim lines from the source that match the failure pattern. */
  evidence: string[];
};

/**
 * DiagnosticsAnalyzer scans a previously-collected diagnostics output directory
 * (produced by `deployment diagnostics logs`) and identifies common failure
 * signatures without requiring a live cluster connection.
 *
 * ## Input sources
 *
 * ### 1. Pod describe files  (`*.describe.txt`)
 * Written by `downloadHieroComponentLogs()` for every pod across all clusters.
 * These are the output of `kubectl describe pod <name> -n <namespace>` and
 * contain the pod's status, container states, events, and resource usage.
 *
 * Detectable errors:
 *
 * | Category        | Detected keywords / conditions                                                         |
 * |-----------------|----------------------------------------------------------------------------------------|
 * | `image-pull`    | `ErrImagePull`, `ImagePullBackOff`, `Back-off pulling image`,                          |
 * |                 | `failed to pull and unpack image`, `unexpected EOF` (truncated layer),                 |
 * |                 | `toomanyrequests`, `rate limit exceeded`, `429 Too Many Requests`                      |
 * | `oom`           | `OOMKilled`, `out of memory`, `reason: OOMKilled`                                      |
 * | `pod-readiness` | Pod `Status` field is not `Running`, or `Ready: False` is present in container status; |
 * |                 | supporting `Reason:` / `Message:` lines are captured as evidence                       |
 *
 * ### 2. Consensus node log archives  (`*-log-config.zip`)
 * Written by `getNodeLogsAndConfigs()` under `~/.solo/logs/<namespace>/`.
 * Each zip contains the node's log and config snapshot.  Only two log files
 * inside the archive are inspected:
 *
 * - `output/swirlds.log` — Hashgraph platform log
 * - `output/hgcaa.log`   — Hedera application log
 *
 * Detectable errors:
 *
 * | Category           | Detected keywords / conditions                                                      |
 * |--------------------|-------------------------------------------------------------------------------------|
 * | `consensus-active` | `swirlds.log` never contains the word `ACTIVE` — the node stalled during           |
 * |                    | startup (e.g. stuck in `STARTING_UP`, `OBSERVING`, or `REPLAYING_EVENTS`);         |
 * |                    | status-transition lines are captured as evidence                                    |
 * | `log-exception`    | Any line in `swirlds.log` or `hgcaa.log` matching `Exception`, `Error`,            |
 * |                    | or `Caused by:` — the first matching stack-trace block (up to 14 lines) is         |
 * |                    | captured as evidence                                                                |
 *
 * ## Output
 * All findings are written to `diagnostics-analysis.txt` inside the input
 * directory.  Up to 10 findings are also printed to the terminal in severity
 * order.  Duplicate findings (same category + title + source) are suppressed.
 */
export class DiagnosticsAnalyzer {
  public constructor(private readonly logger: SoloLogger) {}

  /**
   * Run the full analysis against `customOutputDirectory` (or the default
   * `~/.solo/logs/hiero-components-logs` when empty).
   *
   * Consensus node zip archives are looked up under
   * `~/.solo/logs/<namespaceName>/` when `namespaceName` is provided, or
   * directly under `~/.solo/logs/` otherwise.
   */
  public analyze(customOutputDirectory: string, namespaceName: string | undefined): void {
    const hieroOutputDirectory: string = customOutputDirectory
      ? path.resolve(customOutputDirectory)
      : PathEx.join(constants.SOLO_LOGS_DIR, 'hiero-components-logs');
    const findings: DiagnosticsFinding[] = [];

    this.logger.showUser(`Scanning directory: ${hieroOutputDirectory}`);

    if (fs.existsSync(hieroOutputDirectory)) {
      this.analyzeDescribeFiles(hieroOutputDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Pod describe directory not found, skipping: ${hieroOutputDirectory}`));
    }

    const defaultArchiveDirectory: string = namespaceName
      ? PathEx.join(constants.SOLO_LOGS_DIR, namespaceName)
      : constants.SOLO_LOGS_DIR;
    const consensusArchiveDirectory: string = customOutputDirectory
      ? path.resolve(customOutputDirectory)
      : defaultArchiveDirectory;
    if (fs.existsSync(consensusArchiveDirectory)) {
      this.analyzeConsensusNodeArchives(consensusArchiveDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Consensus archive directory not found, skipping: ${consensusArchiveDirectory}`));
    }

    if (!fs.existsSync(hieroOutputDirectory)) {
      fs.mkdirSync(hieroOutputDirectory, {recursive: true});
    }

    const reportPath: string = PathEx.join(hieroOutputDirectory, 'diagnostics-analysis.txt');
    this.logger.showUser(`Writing report to: ${reportPath}`);
    const reportText: string = this.renderDiagnosticsFindings(findings);
    fs.writeFileSync(reportPath, reportText, 'utf8');

    if (findings.length > 0) {
      this.logger.showUser(
        yellow(
          `Detected ${findings.length} potential issue(s) from diagnostics logs. Summary written to ${reportPath}`,
        ),
      );
      for (const [index, finding] of findings.slice(0, 10).entries()) {
        this.logger.showUser(`${index + 1}. ${finding.title} [${finding.source}]`);
      }
      if (findings.length > 10) {
        this.logger.showUser(`... and ${findings.length - 10} more. See diagnostics-analysis.txt for details.`);
      }
    } else {
      this.logger.showUser(green(`No common failure signatures detected. Report: ${reportPath}`));
    }
  }

  /**
   * Recursively scans `rootDirectory` for `*.describe.txt` files (one per pod)
   * and checks each for image-pull failures, OOM kills, and pod-readiness
   * problems.
   *
   * Detected errors:
   *  - `image-pull`    ErrImagePull / ImagePullBackOff / rate-limit / unexpected EOF
   *  - `oom`           OOMKilled / out of memory
   *  - `pod-readiness` Status != Running  OR  Ready: False
   */
  private analyzeDescribeFiles(rootDirectory: string, findings: DiagnosticsFinding[]): void {
    const describeFiles: string[] = this.collectFilesRecursively(rootDirectory, (filePath: string): boolean =>
      filePath.endsWith('.describe.txt'),
    );

    // Matches any image-pull error surfaced in `kubectl describe pod` output.
    // Covers:
    //   - ErrImagePull / ImagePullBackOff  (standard Kubernetes pull errors)
    //   - "Back-off pulling image"          (CRI back-off message in Events)
    //   - "failed to pull and unpack image" (containerd error)
    //   - "unexpected EOF"                  (truncated layer download)
    //   - toomanyrequests / rate limit exceeded / 429 Too Many Requests
    //     (Docker Hub and other registries throttle anonymous pulls)
    const imagePullPattern: RegExp =
      /ErrImagePull|ImagePullBackOff|Back-off pulling image|failed to pull and unpack image|unexpected EOF|toomanyrequests|rate limit exceeded|429 Too Many Requests/i;

    // Matches out-of-memory kills.
    // "OOMKilled" appears in the container's LastTerminationState and in Events.
    // "reason: OOMKilled" is the structured field in the container status JSON.
    const oomPattern: RegExp = /OOMKilled|out of memory|reason:\s*OOMKilled/i;

    this.logger.showUser(`  Found ${describeFiles.length} pod describe file(s)`);

    for (const describeFile of describeFiles) {
      const relativePath: string = path.relative(rootDirectory, describeFile);
      this.logger.showUser(`  Reading: ${relativePath}`);
      let content: string;
      try {
        content = fs.readFileSync(describeFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read describe file ${relativePath}: ${(error as Error).message}`));
        continue;
      }

      const podName: string = path.basename(describeFile, '.describe.txt');
      const source: string = path.relative(rootDirectory, describeFile);

      if (imagePullPattern.test(content)) {
        this.addDiagnosticsFinding(findings, {
          category: 'image-pull',
          title: `Image pull failure detected for pod ${podName}`,
          source,
          evidence: this.extractMatchSnippets(content, imagePullPattern, 8),
        });
      }

      if (oomPattern.test(content)) {
        this.addDiagnosticsFinding(findings, {
          category: 'oom',
          title: `OOM-related failure detected for pod ${podName}`,
          source,
          evidence: this.extractMatchSnippets(content, oomPattern, 6),
        });
      }

      // A pod is unhealthy if its top-level status is anything other than
      // "Running" or if any container is not ready.
      //
      // Two file formats are possible depending on how the describe file was
      // collected:
      //   - Text format (kubectl describe pod):  "Status: Pending"
      //                                          "Ready: False"
      //   - YAML format (kubectl get pod -o yaml): "phase: Pending"
      //                                            "ready: false"
      //
      // Both are matched so the check is format-agnostic.
      // Reason: / Message: / reason: / message: lines (case-insensitive) are
      // captured for additional context.
      const statusMatch: RegExpMatchArray = content.match(/^\s*(?:Status|phase):\s+([^\n]+)/m);
      const status: string = statusMatch?.[1]?.trim().replaceAll(/^"|"$/g, '') ?? '';
      const readyFalse: boolean = /^\s*[Rr]eady:\s+[Ff]alse\b/m.test(content);
      if ((status && status !== constants.POD_PHASE_RUNNING) || readyFalse) {
        const evidence: string[] = [];
        if (status) {
          evidence.push(`Status: ${status}`);
        }
        if (readyFalse) {
          evidence.push('Ready: False');
        }
        evidence.push(...this.extractMatchSnippets(content, /^\s*(Reason|Message):\s+.+$/i, 8));

        this.addDiagnosticsFinding(findings, {
          category: 'pod-readiness',
          title: `Pod not ready/running: ${podName}`,
          source,
          evidence,
        });
      }
    }
  }

  /**
   * Recursively scans `archiveRootDirectory` for `*-log-config.zip` archives
   * produced by `getNodeLogsAndConfigs()` and inspects two log files inside
   * each archive:
   *
   *  - `output/swirlds.log` — checked for absence of the `ACTIVE` platform
   *    status marker (category: `consensus-active`) and for exception blocks
   *    (category: `log-exception`).
   *  - `output/hgcaa.log`   — checked for exception blocks only
   *    (category: `log-exception`).
   *
   * Only the first exception block per log file is captured (up to 14 lines)
   * to keep the report readable.
   */
  private analyzeConsensusNodeArchives(archiveRootDirectory: string, findings: DiagnosticsFinding[]): void {
    const archiveFiles: string[] = this.collectFilesRecursively(archiveRootDirectory, (filePath: string): boolean =>
      filePath.endsWith('-log-config.zip'),
    );

    this.logger.showUser(`  Found ${archiveFiles.length} consensus log archive(s)`);

    for (const archiveFile of archiveFiles) {
      const archiveName: string = path.basename(archiveFile);
      this.logger.showUser(`  Unzipping: ${archiveName}`);
      let archive: AdmZip;
      try {
        archive = new AdmZip(archiveFile, {readEntries: true});
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read archive ${archiveName}: ${(error as Error).message}`));
        continue;
      }

      for (const entry of archive.getEntries()) {
        const entryName: string = entry.entryName;
        if (!entryName.endsWith('output/swirlds.log') && !entryName.endsWith('output/hgcaa.log')) {
          continue;
        }
        this.logger.showUser(`    Reading entry: ${entryName}`);

        const source: string = `${archiveName}:${entryName}`;
        const content: string = entry.getData().toString('utf8');

        // A healthy consensus node transitions through STARTING_UP → OBSERVING →
        // REPLAYING_EVENTS → ACTIVE.  If `ACTIVE` never appears in swirlds.log
        // the node stalled before becoming ready to handle transactions.
        if (entryName.endsWith('output/swirlds.log') && !/\bACTIVE\b/.test(content)) {
          const evidence: string[] = this.extractMatchSnippets(
            content,
            /PlatformStatus|status|STARTING_UP|OBSERVING|REPLAYING_EVENTS|FREEZING|ACTIVE/i,
            8,
          );
          if (evidence.length === 0) {
            evidence.push('No ACTIVE status marker found in swirlds.log');
          }

          this.addDiagnosticsFinding(findings, {
            category: 'consensus-active',
            title: 'Consensus node may not have reached ACTIVE status',
            source,
            evidence,
          });
        }

        // Capture the first exception/stack-trace block from either log file.
        // Stack frames beginning with "at ", "Caused by:", or "... N more" are
        // included as continuation lines of the same block.
        const exceptionBlocks: string[] = this.extractExceptionBlocks(content, 1, 14);
        if (exceptionBlocks.length > 0) {
          this.addDiagnosticsFinding(findings, {
            category: 'log-exception',
            title: `Exception detected in ${entryName.endsWith('swirlds.log') ? 'swirlds.log' : 'hgcaa.log'}`,
            source,
            evidence: exceptionBlocks[0].split('\n').filter((line: string): boolean => line.trim().length > 0),
          });
        }
      }
    }
  }

  /**
   * Adds `finding` to `findings` unless an identical entry (same category,
   * title, and source) already exists.  Evidence lines are deduplicated and
   * capped at 14 entries to keep the report compact.
   */
  private addDiagnosticsFinding(findings: DiagnosticsFinding[], finding: DiagnosticsFinding): void {
    const key: string = `${finding.category}|${finding.title}|${finding.source}`;
    const existingKeys: Set<string> = new Set(
      findings.map((item: DiagnosticsFinding): string => `${item.category}|${item.title}|${item.source}`),
    );
    if (existingKeys.has(key)) {
      return;
    }

    findings.push({
      ...finding,
      evidence: [...new Set(finding.evidence)].filter((line: string): boolean => line.trim().length > 0).slice(0, 14),
    });
  }

  /**
   * Walks `rootDirectory` recursively and returns all file paths for which
   * `matcher` returns `true`.
   */
  private collectFilesRecursively(rootDirectory: string, matcher: (filePath: string) => boolean): string[] {
    const files: string[] = [];
    const visit: (directory: string) => void = (directory: string): void => {
      const entries: fs.Dirent[] = fs.readdirSync(directory, {withFileTypes: true});
      for (const entry of entries) {
        const entryPath: string = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(entryPath);
          continue;
        }
        if (entry.isFile() && matcher(entryPath)) {
          files.push(entryPath);
        }
      }
    };

    visit(rootDirectory);
    return files;
  }

  /**
   * Returns up to `maxMatches` lines from `content` that match `pattern`,
   * formatted as `"line <N>: <trimmed line>"`.
   *
   * The global (`g`) flag is stripped before matching so the RegExp lastIndex
   * does not interfere with repeated calls against the same pattern instance.
   */
  private extractMatchSnippets(content: string, pattern: RegExp, maxMatches: number): string[] {
    const snippets: string[] = [];
    const lines: string[] = content.split(/\r?\n/);
    const normalizedFlags: string = pattern.flags.includes('g') ? pattern.flags.replaceAll('g', '') : pattern.flags;
    const matcher: RegExp = new RegExp(pattern.source, normalizedFlags);

    for (const [index, line] of lines.entries()) {
      if (matcher.test(line)) {
        snippets.push(`line ${index + 1}: ${line.trim()}`);
        if (snippets.length >= maxMatches) {
          break;
        }
      }
    }

    return snippets;
  }

  /**
   * Extracts up to `maxBlocks` exception/stack-trace blocks from `content`.
   *
   * A block starts on any line matching `Exception`, `Error`, or `Caused by:`
   * and continues as long as subsequent lines are stack frames (`at …`),
   * chained causes (`Caused by:`), or truncation markers (`… N more`).
   * Each block is capped at `maxLinesPerBlock` lines.
   */
  private extractExceptionBlocks(content: string, maxBlocks: number, maxLinesPerBlock: number): string[] {
    const lines: string[] = content.split(/\r?\n/);
    const blocks: string[] = [];
    const startPattern: RegExp = /\b(?:Exception|Error)\b|^\s*Caused by:/;

    for (let index: number = 0; index < lines.length && blocks.length < maxBlocks; index++) {
      if (!startPattern.test(lines[index])) {
        continue;
      }

      const blockLines: string[] = [lines[index]];
      let next: number = index + 1;
      while (next < lines.length && blockLines.length < maxLinesPerBlock) {
        const line: string = lines[next];
        if (/^\s+at\s+/.test(line) || /^\s*Caused by:/.test(line) || /^\s*\.\.\.\s+\d+\s+more/.test(line)) {
          blockLines.push(line);
          next++;
          continue;
        }
        break;
      }

      blocks.push(blockLines.join('\n'));
      index = next - 1;
    }

    return blocks;
  }

  /**
   * Renders all findings into a human-readable plain-text report, sorted by
   * severity (image-pull → oom → pod-readiness → consensus-active →
   * log-exception).  Returns the report as a string ready to be written to
   * `diagnostics-analysis.txt`.
   */
  private renderDiagnosticsFindings(findings: DiagnosticsFinding[]): string {
    const severityOrder: Record<DiagnosticsFindingCategory, number> = {
      'image-pull': 1,
      oom: 2,
      'pod-readiness': 3,
      'consensus-active': 4,
      'log-exception': 5,
    };
    const categoryLabel: Record<DiagnosticsFindingCategory, string> = {
      'image-pull': 'Image Pull',
      oom: 'Out Of Memory',
      'pod-readiness': 'Pod Readiness',
      'consensus-active': 'Consensus Active State',
      'log-exception': 'Exception Stack',
    };

    const lines: string[] = ['Solo Diagnostics Analysis Report', `Generated: ${new Date().toISOString()}`, ''];

    if (findings.length === 0) {
      lines.push('No common failure signatures were detected.');
      return lines.join('\n');
    }

    const orderedFindings: DiagnosticsFinding[] = [];
    for (const finding of findings) {
      let insertionIndex: number = orderedFindings.length;
      for (const [index, existingFinding] of orderedFindings.entries()) {
        if (severityOrder[finding.category] < severityOrder[existingFinding.category]) {
          insertionIndex = index;
          break;
        }
      }
      orderedFindings.splice(insertionIndex, 0, finding);
    }

    lines.push(`Detected ${orderedFindings.length} potential issue(s):`, '');

    for (const [index, finding] of orderedFindings.entries()) {
      lines.push(`${index + 1}. [${categoryLabel[finding.category]}] ${finding.title}`, `   Source: ${finding.source}`);
      if (finding.evidence.length > 0) {
        lines.push('   Evidence:');
        for (const evidenceLine of finding.evidence) {
          lines.push(`   - ${evidenceLine}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
