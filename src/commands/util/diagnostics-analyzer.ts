// SPDX-License-Identifier: Apache-2.0

import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type DiagnosticsFinding, type DiagnosticsFindingCategory} from './diagnostics-finding.js';

const {green, yellow} = chalk;

interface ConsensusLogDefinition {
  entrySuffix: 'output/swirlds.log' | 'output/hgcaa.log';
  displayName: 'swirlds.log' | 'hgcaa.log';
  checkConsensusActive: boolean;
}

/**
 * Binds a log file path pattern to a message pattern that should be treated
 * as transient (and therefore suppressed) when analyzing that file. Used to
 * filter out known startup races and benign-but-noisy server messages while
 * still surfacing genuine errors.
 *
 * Path patterns are matched against the file's relative path normalized to
 * forward slashes, so authors can write them portably.
 */
interface TransientErrorPattern {
  /** Matches the log file's relative path (forward-slash form). */
  logFilePattern: RegExp;
  /** Matches the error line text to suppress within that log file. */
  messagePattern: RegExp;
  /** Short reason describing why this match is treated as transient. */
  reason: string;
}

/**
 * Suppresses any error line whose timestamp falls within `windowSeconds` of
 * the first timestamped line in a log file matching `logFilePattern`. Use
 * this when a component is known to emit transient retry/connect errors
 * during initial startup that self-heal once dependencies are ready (e.g.
 * Mirror Node importer retrying downloads while the consensus node is still
 * becoming ACTIVE and the database is still migrating).
 */
interface StartupErrorSuppression {
  /** Matches the log file's relative path (forward-slash form). */
  logFilePattern: RegExp;
  /** Suppress error lines within this many seconds of the first log timestamp. */
  windowSeconds: number;
  /** Short reason describing why early errors in this file are suppressed. */
  reason: string;
}

/**
 * Suppresses error lines matching `errorPattern` in files matching
 * `logFilePattern` **only if** a corresponding success line matching
 * `successPattern` appears anywhere in the same file. Use this for
 * retry-until-success patterns where a later success message proves the
 * earlier errors were transient (e.g. REST API retrying its Redis
 * connection and eventually logging "Startup Connected to redis://...").
 */
interface ConditionalErrorSuppression {
  /** Matches the log file's relative path (forward-slash form). */
  logFilePattern: RegExp;
  /** Matches error lines that should be dropped when `successPattern` is present. */
  errorPattern: RegExp;
  /** Must appear somewhere in the same file for `errorPattern` matches to be dropped. */
  successPattern: RegExp;
  /** Short reason describing why this conditional suppression applies. */
  reason: string;
}

/**
 * DiagnosticsAnalyzer scans a previously-collected diagnostics output directory
 * (produced by `deployment diagnostics logs`) and identifies common failure
 * signatures without requiring a live cluster connection.
 *
 * ## Input sources
 *
 * ### 1. Solo CLI log  (`solo.log`)
 * The Solo CLI's own Pino log file (`~/.solo/logs/solo.log` by default, or
 * `solo.log` found recursively under `customOutputDirectory`).  Lines
 * matching `] ERROR:` are captured as `app-error` findings.  ANSI escape
 * codes and `[traceId="..."]` suffixes are stripped before matching.
 *
 * ### 2. Pod describe files  (`*.describe.txt`)
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
  private static readonly CONSENSUS_LOG_DEFINITIONS: readonly ConsensusLogDefinition[] = [
    {entrySuffix: 'output/swirlds.log', displayName: 'swirlds.log', checkConsensusActive: true},
    {entrySuffix: 'output/hgcaa.log', displayName: 'hgcaa.log', checkConsensusActive: false},
  ];

  /**
   * Known transient errors that surface during normal startup and should not
   * be reported as failures. Each entry binds a log-file path pattern to a
   * message pattern; lines matching both are dropped from `app-error`
   * findings. New entries can be added here without touching scanner logic.
   */
  private static readonly TRANSIENT_ERROR_PATTERNS: readonly TransientErrorPattern[] = [
    {
      // Mirror Node's FixCryptoAllowanceAmountMigration (an AsyncJavaMigration)
      // queries a temporary working table before it has been created on a
      // fresh database. The Java side handles this gracefully (logs WARN,
      // falls back to Long.MAX_VALUE), but Postgres still emits an ERROR
      // line into its server log, which would otherwise surface as a finding.
      logFilePattern: /solo-shared-resources-postgres[^/]*\.log$/i,
      messagePattern: /relation "[^"]+" does not exist/i,
      reason: 'Postgres "relation does not exist" during Flyway async-migration startup race',
    },
  ];

  /**
   * Per-file startup grace windows. Any error line whose log timestamp falls
   * within `windowSeconds` of the first timestamped line in the same file is
   * dropped from findings. Used for components that emit retry/connect
   * errors while waiting on their dependencies during cluster bring-up.
   */
  private static readonly STARTUP_ERROR_SUPPRESSIONS: readonly StartupErrorSuppression[] = [
    {
      // The mirror node importer logs download / connect / timeout errors
      // while it waits for the consensus node to become ACTIVE and the
      // database to finish migrating. These stop on their own once
      // dependencies are ready (typically well within one minute).
      logFilePattern: /mirror[^/]*-importer[^/]*\.log$/i,
      windowSeconds: 60,
      reason: 'Mirror Node importer retries during initial startup window',
    },
  ];

  /**
   * Error/success pairings. When the success line is present, matching
   * error lines are dropped because the retry loop eventually succeeded.
   */
  private static readonly CONDITIONAL_ERROR_SUPPRESSIONS: readonly ConditionalErrorSuppression[] = [
    {
      // Mirror Node REST API retries its Redis connection until the Redis
      // pod is reachable, logging an ERROR per attempt. A subsequent
      // "Startup Connected to redis://..." line proves the retry loop
      // succeeded — the earlier errors are then noise, not failures.
      logFilePattern: /mirror[^/]*-rest[^/]*\.log$/i,
      errorPattern: /Startup Error connecting to/i,
      successPattern: /Startup Connected to/i,
      reason: 'Mirror Node REST retry succeeded after initial connection errors',
    },
  ];

  /** Matches an ISO-8601 timestamp at the start of an application log line. */
  private static readonly LOG_LINE_TIMESTAMP_PATTERN: RegExp =
    /^\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/;

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

    let consensusArchiveDirectory: string = constants.SOLO_LOGS_DIR;
    if (customOutputDirectory) {
      consensusArchiveDirectory = path.resolve(customOutputDirectory);
    } else if (namespaceName) {
      consensusArchiveDirectory = PathEx.join(constants.SOLO_LOGS_DIR, namespaceName);
    }
    if (fs.existsSync(consensusArchiveDirectory)) {
      this.analyzeConsensusNodeArchives(consensusArchiveDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Consensus archive directory not found, skipping: ${consensusArchiveDirectory}`));
    }

    if (fs.existsSync(hieroOutputDirectory)) {
      this.analyzePodLogFiles(hieroOutputDirectory, findings);
    }

    if (fs.existsSync(hieroOutputDirectory)) {
      this.analyzeSoloLogFiles(hieroOutputDirectory, customOutputDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Diagnostics output directory not found, skipping: ${hieroOutputDirectory}`));
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
        if (finding.evidence.length > 0) {
          const maxEvidenceLines: number = finding.category === 'log-exception' ? 8 : 4;
          for (const evidenceLine of finding.evidence.slice(0, maxEvidenceLines)) {
            this.logger.showUser(`   - ${evidenceLine}`);
          }
          if (finding.evidence.length > maxEvidenceLines) {
            this.logger.showUser(
              `   ... and ${finding.evidence.length - maxEvidenceLines} more evidence line(s) in diagnostics-analysis.txt`,
            );
          }
        }
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
      const relatedPath: string = path.relative(rootDirectory, describeFile);
      this.logger.showUser(`  Reading: ${relatedPath}`);
      let content: string;
      try {
        content = fs.readFileSync(describeFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read describe file ${relatedPath}: ${(error as Error).message}`));
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
        evidence.push(...this.extractMatchSnippetsJoiningContinuations(content, /^\s*(Reason|Message):\s+/i, 8));

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
   * Recursively scans `rootDirectory` for `*.log` pod log files and checks each
   * for application-level ERROR lines (category: `app-error`).
   *
   * These are the raw container logs downloaded by `downloadHieroComponentLogs()`
   * alongside the `*.describe.txt` files. Each file is scanned for lines
   * containing `ERROR` and the first matching block (up to 8 lines) is captured.
   */
  private analyzePodLogFiles(rootDirectory: string, findings: DiagnosticsFinding[]): void {
    // Only scan logs for non-consensus components. Consensus node logs are
    // handled separately via the *-log-config.zip archives (which include
    // swirlds.log and hgcaa.log).  Broad *.log would match those files too
    // and produce duplicate / noisy findings.
    const componentLogPattern: RegExp = /[\\/](?:mirror|block|relay|explorer|solo-shared)[^/\\]*\.log$/i;
    const logFiles: string[] = this.collectFilesRecursively(rootDirectory, (filePath: string): boolean =>
      componentLogPattern.test(filePath),
    );

    // Strip Docker/containerd timestamp prefix (e.g. "2026-04-06T03:24:32.470558065Z ") before matching.
    const errorPattern: RegExp = /\b(?:ERROR|FATAL)\b/i;

    this.logger.showUser(`  Found ${logFiles.length} pod log file(s)`);

    for (const logFile of logFiles) {
      const relativePath: string = path.relative(rootDirectory, logFile);
      this.logger.showUser(`  Reading: ${relativePath}`);
      let content: string;
      try {
        content = fs.readFileSync(logFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read log file ${relativePath}: ${(error as Error).message}`));
        continue;
      }

      // Strip leading container-runtime timestamps so the pattern matches the application log line.
      const strippedContent: string = content.replaceAll(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/gm, '');
      if (!errorPattern.test(strippedContent)) {
        continue;
      }

      const podName: string = path.basename(logFile, '.log');
      const errorScan: {evidence: string[]; suppressed: number} = this.extractFilteredErrorSnippets(
        strippedContent,
        errorPattern,
        relativePath,
        8,
      );
      if (errorScan.suppressed > 0) {
        this.logger.showUser(`  Suppressed ${errorScan.suppressed} transient error line(s) in ${relativePath}`);
      }
      if (errorScan.evidence.length === 0) {
        continue;
      }
      this.addDiagnosticsFinding(findings, {
        category: 'app-error',
        title: `Application ERROR detected in pod log: ${podName}`,
        source: relativePath,
        evidence: errorScan.evidence,
      });
    }
  }

  /**
   * Searches for `solo.log` in `hieroOutputDirectory` (recursively) and, when
   * no custom output directory was specified, also checks the standard
   * `~/.solo/logs/solo.log` location.  ERROR lines are extracted and reported
   * as `app-error` findings.
   *
   */
  private analyzeSoloLogFiles(
    hieroOutputDirectory: string,
    customOutputDirectory: string,
    findings: DiagnosticsFinding[],
  ): void {
    const soloLogFiles: string[] = this.collectFilesRecursively(
      hieroOutputDirectory,
      (filePath: string): boolean => path.basename(filePath) === 'solo.log',
    );

    // When using the default output path, the solo.log lives one level up at
    // ~/.solo/logs/solo.log — outside hieroOutputDirectory, so check it separately.
    if (!customOutputDirectory) {
      const defaultSoloLog: string = PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log');
      if (fs.existsSync(defaultSoloLog) && !soloLogFiles.includes(defaultSoloLog)) {
        soloLogFiles.push(defaultSoloLog);
      }
    }

    this.logger.showUser(`  Found ${soloLogFiles.length} solo log file(s)`);

    // Anchor to the Pino entry prefix "[HH:MM:SS.mmm] ERROR:" so that INFO/WARN
    // entries which quote a downstream "] ERROR:" fragment (e.g. when the
    // diagnostics report itself is logged) do not produce false-positive matches.
    const errorPattern: RegExp = /^\[\d{2}:\d{2}:\d{2}\.\d{3}]\s+ERROR:/m;
    // eslint-disable-next-line no-control-regex
    const ansiPattern: RegExp = new RegExp('\u001B\\[[0-9;]*m', 'g');
    const traceIdPattern: RegExp = /\s+\[traceId="[^"]*"\]/g;

    for (const soloLogFile of soloLogFiles) {
      const relativePath: string = path.relative(hieroOutputDirectory, soloLogFile);
      const sourceLabel: string = relativePath || path.basename(soloLogFile);
      this.logger.showUser(`  Reading: ${sourceLabel}`);
      let content: string;
      try {
        content = fs.readFileSync(soloLogFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read solo log ${sourceLabel}: ${(error as Error).message}`));
        continue;
      }

      const cleanedContent: string = content.replaceAll(ansiPattern, '').replaceAll(traceIdPattern, '');
      if (!errorPattern.test(cleanedContent)) {
        continue;
      }

      const evidence: string[] = this.extractSoloLogErrorBlocks(cleanedContent, 3, 14);
      this.addDiagnosticsFinding(findings, {
        category: 'app-error',
        title: 'ERROR detected in solo.log',
        source: sourceLabel,
        evidence,
      });
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
        const logDefinition: ConsensusLogDefinition | undefined = this.findConsensusLogDefinition(entry.entryName);
        if (!logDefinition) {
          continue;
        }
        this.analyzeConsensusLogEntry(archiveName, entry, logDefinition, findings);
      }
    }
  }

  private findConsensusLogDefinition(entryName: string): ConsensusLogDefinition | undefined {
    return DiagnosticsAnalyzer.CONSENSUS_LOG_DEFINITIONS.find((logDefinition: ConsensusLogDefinition): boolean =>
      entryName.endsWith(logDefinition.entrySuffix),
    );
  }

  private analyzeConsensusLogEntry(
    archiveName: string,
    entry: AdmZip.IZipEntry,
    logDefinition: ConsensusLogDefinition,
    findings: DiagnosticsFinding[],
  ): void {
    this.logger.showUser(`    Reading entry: ${entry.entryName}`);
    const source: string = `${archiveName}:${entry.entryName}`;
    const content: string = entry.getData().toString('utf8');

    if (logDefinition.checkConsensusActive) {
      this.analyzeConsensusActiveStatus(content, source, findings);
    }
    this.analyzeExceptionBlocks(logDefinition.displayName, content, source, findings);
  }

  /**
   * A healthy consensus node transitions through STARTING_UP → OBSERVING →
   * REPLAYING_EVENTS → ACTIVE. If `ACTIVE` never appears in swirlds.log,
   * the node likely stalled before becoming ready for transactions.
   */
  private analyzeConsensusActiveStatus(content: string, source: string, findings: DiagnosticsFinding[]): void {
    if (/\bACTIVE\b/.test(content)) {
      return;
    }

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

  /**
   * Captures the first exception/stack-trace block from a consensus log file.
   */
  private analyzeExceptionBlocks(
    logDisplayName: ConsensusLogDefinition['displayName'],
    content: string,
    source: string,
    findings: DiagnosticsFinding[],
  ): void {
    const exceptionBlocks: string[] = this.extractExceptionBlocks(content, 1, 14);
    if (exceptionBlocks.length === 0) {
      return;
    }

    this.addDiagnosticsFinding(findings, {
      category: 'log-exception',
      title: `Exception detected in ${logDisplayName}`,
      source,
      evidence: exceptionBlocks[0].split('\n').filter((line: string): boolean => line.trim().length > 0),
    });
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
   * Extracts up to `maxBlocks` ERROR blocks from a solo.log file.
   *
   * Each block starts on a line matching `] ERROR:` and continues while
   * subsequent lines are indented (part of the Pino `err:` object dump).
   * A new log entry — any line starting with `[HH:MM:SS` — terminates the
   * current block.  Each block is capped at `maxLinesPerBlock` lines.
   *
   * Evidence lines are returned flat (one string per line) in
   * `"line <N>: <content>"` format so they render consistently with other
   * findings.
   */
  private extractSoloLogErrorBlocks(content: string, maxBlocks: number, maxLinesPerBlock: number): string[] {
    const lines: string[] = content.split(/\r?\n/);
    // Anchored to the Pino entry prefix to skip INFO/WARN lines that quote
    // a downstream "] ERROR:" fragment as part of their message body.
    const errorPattern: RegExp = /^\[\d{2}:\d{2}:\d{2}\.\d{3}]\s+ERROR:/;
    // New Pino log entries start with a bracketed timestamp, e.g. "[17:25:23.788]"
    const newEntryPattern: RegExp = /^\[\d{2}:\d{2}:\d{2}\.\d{3}]/;
    const evidence: string[] = [];
    let blocksCollected: number = 0;

    for (let index: number = 0; index < lines.length && blocksCollected < maxBlocks; index++) {
      if (!errorPattern.test(lines[index])) {
        continue;
      }

      const blockLines: string[] = [`line ${index + 1}: ${lines[index].trim()}`];
      let next: number = index + 1;
      while (next < lines.length && blockLines.length < maxLinesPerBlock) {
        const nextLine: string = lines[next];
        // Stop at the next log entry or a blank line that precedes one
        if (newEntryPattern.test(nextLine)) {
          break;
        }
        if (nextLine.trim().length > 0) {
          blockLines.push(`line ${next + 1}: ${nextLine.trim()}`);
        }
        next++;
      }

      evidence.push(...blockLines);
      blocksCollected++;
      index = next - 1;
    }

    return evidence;
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
   * Returns the subset of {@link TRANSIENT_ERROR_PATTERNS} that apply to the
   * given log file. The path is normalized to forward slashes so patterns
   * can be authored portably.
   */
  private getTransientPatternsForFile(relativePath: string): readonly TransientErrorPattern[] {
    const normalizedPath: string = relativePath.replaceAll('\\', '/');
    return DiagnosticsAnalyzer.TRANSIENT_ERROR_PATTERNS.filter((transientPattern: TransientErrorPattern): boolean =>
      transientPattern.logFilePattern.test(normalizedPath),
    );
  }

  /**
   * Returns the longest startup-suppression window (in seconds) that applies
   * to `relativePath`, or 0 if no entry matches.  Multiple matching entries
   * are merged by taking the maximum window so the more-permissive rule wins.
   */
  private getStartupSuppressionWindowForFile(relativePath: string): number {
    const normalizedPath: string = relativePath.replaceAll('\\', '/');
    const matchingWindows: number[] = DiagnosticsAnalyzer.STARTUP_ERROR_SUPPRESSIONS.filter(
      (suppression: StartupErrorSuppression): boolean => suppression.logFilePattern.test(normalizedPath),
    ).map((suppression: StartupErrorSuppression): number => suppression.windowSeconds);
    return matchingWindows.length === 0 ? 0 : Math.max(...matchingWindows);
  }

  /**
   * Returns the error patterns from {@link CONDITIONAL_ERROR_SUPPRESSIONS}
   * whose `successPattern` is present in `content` for the given file —
   * i.e. the retry eventually succeeded.  Lines matching one of the
   * returned patterns can be safely suppressed.
   */
  private getActiveConditionalErrorPatterns(relativePath: string, content: string): readonly RegExp[] {
    const normalizedPath: string = relativePath.replaceAll('\\', '/');
    return DiagnosticsAnalyzer.CONDITIONAL_ERROR_SUPPRESSIONS.filter(
      (suppression: ConditionalErrorSuppression): boolean =>
        suppression.logFilePattern.test(normalizedPath) && suppression.successPattern.test(content),
    ).map((suppression: ConditionalErrorSuppression): RegExp => suppression.errorPattern);
  }

  /**
   * Parses an ISO-8601 timestamp possibly carrying sub-millisecond precision
   * (e.g. nanoseconds from container runtimes).  JavaScript Date only handles
   * three fractional digits, so longer precision is truncated.  Returns
   * undefined when the string cannot be parsed.
   */
  private parseLogTimestamp(text: string): Date | undefined {
    const normalizedText: string = text.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
    const parsedDate: Date = new Date(normalizedText);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  /**
   * Returns the timestamp of the first line in `content` that carries one,
   * or undefined if no timestamped line is found.  Used as the start-of-log
   * reference point for {@link isWithinStartupWindow}.
   */
  private findFirstTimestamp(content: string): Date | undefined {
    const lines: string[] = content.split(/\r?\n/);
    for (const line of lines) {
      const timestampMatch: RegExpMatchArray | null = line.match(DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN);
      if (!timestampMatch) {
        continue;
      }
      const parsedDate: Date | undefined = this.parseLogTimestamp(timestampMatch[1]);
      if (parsedDate) {
        return parsedDate;
      }
    }
    return undefined;
  }

  /**
   * Returns true when `line` carries a timestamp at or before
   * `startTime + windowSeconds`.  Lines without a parseable timestamp are
   * NOT considered within the window — we err on the side of surfacing the
   * error rather than hiding it.
   */
  private isWithinStartupWindow(line: string, startTime: Date, windowSeconds: number): boolean {
    const timestampMatch: RegExpMatchArray | null = line.match(DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN);
    if (!timestampMatch) {
      return false;
    }
    const lineTime: Date | undefined = this.parseLogTimestamp(timestampMatch[1]);
    if (!lineTime) {
      return false;
    }
    const deltaSeconds: number = (lineTime.getTime() - startTime.getTime()) / 1000;
    return deltaSeconds <= windowSeconds;
  }

  /**
   * Like {@link extractMatchSnippets} but drops error lines that fall into
   * any of three suppression categories configured for `relativePath`:
   *   1. transient message patterns       — known benign messages
   *   2. startup grace window              — within N seconds of log start
   *   3. retry-with-eventual-success pair  — success marker present elsewhere
   *
   * Suppression is block-aware: a log entry is a header line (timestamp at
   * start of line) plus all following lines until the next header. When the
   * header is suppressed, every continuation match within the block (e.g.
   * `Suppressed: ... terminated with an error` inside a stack trace) is
   * cascaded into the same suppression — so a single suppressed error never
   * leaks through as separate evidence via its own stack frames. The same
   * cascading collapses non-suppressed blocks so each surfaces at most once.
   *
   * Returns both the captured evidence (capped at `maxMatches`) and the
   * number of lines that were suppressed so callers can surface a note.
   */
  private extractFilteredErrorSnippets(
    content: string,
    errorPattern: RegExp,
    relativePath: string,
    maxMatches: number,
  ): {evidence: string[]; suppressed: number} {
    const lines: string[] = content.split(/\r?\n/);
    const transientPatterns: readonly TransientErrorPattern[] = this.getTransientPatternsForFile(relativePath);
    const startupWindowSeconds: number = this.getStartupSuppressionWindowForFile(relativePath);
    const startupReferenceTime: Date | undefined =
      startupWindowSeconds > 0 ? this.findFirstTimestamp(content) : undefined;
    const activeConditionalPatterns: readonly RegExp[] = this.getActiveConditionalErrorPatterns(relativePath, content);
    const normalizedFlags: string = errorPattern.flags.includes('g')
      ? errorPattern.flags.replaceAll('g', '')
      : errorPattern.flags;
    const matcher: RegExp = new RegExp(errorPattern.source, normalizedFlags);

    const evidence: string[] = [];
    let suppressed: number = 0;
    let inErrorBlock: boolean = false;
    let blockSuppressed: boolean = false;

    for (const [index, line] of lines.entries()) {
      // A new timestamped log entry ends any open error block. Stack-trace
      // continuation lines (no leading timestamp) inherit the prior block.
      if (DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN.test(line)) {
        inErrorBlock = false;
        blockSuppressed = false;
      }

      if (!matcher.test(line)) {
        continue;
      }

      // Continuation matches (e.g. "Suppressed: ... terminated with an error"
      // inside a stack trace) inherit the header's suppression decision and
      // are never reported as separate evidence even if the block was not
      // suppressed — they belong to the already-surfaced header.
      if (inErrorBlock) {
        if (blockSuppressed) {
          suppressed++;
        }
        continue;
      }

      inErrorBlock = true;

      const isTransientMessage: boolean = transientPatterns.some((transientPattern: TransientErrorPattern): boolean =>
        transientPattern.messagePattern.test(line),
      );
      if (isTransientMessage) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      if (startupReferenceTime && this.isWithinStartupWindow(line, startupReferenceTime, startupWindowSeconds)) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      const isConditionallySuppressed: boolean = activeConditionalPatterns.some((conditionalPattern: RegExp): boolean =>
        conditionalPattern.test(line),
      );
      if (isConditionallySuppressed) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      if (evidence.length < maxMatches) {
        evidence.push(`line ${index + 1}: ${line.trim()}`);
      }
    }

    return {evidence, suppressed};
  }

  /**
   * Like {@link extractMatchSnippets} but joins indented continuation lines
   * (YAML/kubectl-describe multi-line values) into a single evidence entry.
   *
   * When a matching key line is found, any immediately following lines whose
   * leading whitespace is strictly greater than the key line's indentation are
   * appended (space-separated) before the snippet is recorded.  This collapses
   * a multi-line `message:` value into one readable line instead of surfacing
   * only the truncated first line.
   */
  private extractMatchSnippetsJoiningContinuations(content: string, pattern: RegExp, maxMatches: number): string[] {
    const snippets: string[] = [];
    const lines: string[] = content.split(/\r?\n/);
    const normalizedFlags: string = pattern.flags.includes('g') ? pattern.flags.replaceAll('g', '') : pattern.flags;
    const matcher: RegExp = new RegExp(pattern.source, normalizedFlags);

    for (let index: number = 0; index < lines.length && snippets.length < maxMatches; index++) {
      const line: string = lines[index];
      if (!matcher.test(line)) {
        continue;
      }

      const keyIndent: number = (line.match(/^(\s*)/)?.[1] ?? '').length;
      let joined: string = line.trim();

      // Absorb continuation lines that are indented more than the key line.
      let next: number = index + 1;
      while (next < lines.length) {
        const nextLine: string = lines[next];
        if (nextLine.trim().length === 0) {
          break;
        }
        const nextIndent: number = (nextLine.match(/^(\s*)/)?.[1] ?? '').length;
        if (nextIndent <= keyIndent) {
          break;
        }
        joined += ' ' + nextLine.trim();
        next++;
      }

      snippets.push(`line ${index + 1}: ${joined}`);
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
    const timestampPattern: RegExp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
    const exceptionTypeLinePattern: RegExp =
      /^\s*(?:[a-z_][A-Za-z0-9_$]*\.)*[A-Z][A-Za-z0-9_$]*(?:Exception|Error|Throwable)(?::|\b)/;
    const startPattern: RegExp = new RegExp(
      String.raw`${exceptionTypeLinePattern.source}|\b(?:Exception|Error)\b|^\s*Caused by:`,
    );

    // Matches only the severity levels that indicate a real error.
    const errorLevelPattern: RegExp = /\b(?:ERROR|FATAL|SEVERE)\b/i;

    for (let index: number = 0; index < lines.length && blocks.length < maxBlocks; index++) {
      if (!startPattern.test(lines[index])) {
        continue;
      }

      // Look back up to 5 lines to find the nearest timestamped log line and
      // determine its severity.  Stack traces following a WARN/INFO/DEBUG line
      // are expected (e.g. FileAlreadyExistsException on a WARN archive attempt)
      // and must not be reported as findings.
      let precedingIsError: boolean = false;
      let precedingLogLine: string = '';
      for (let scan: number = index - 1; scan >= 0 && scan >= index - 5; scan--) {
        if (timestampPattern.test(lines[scan])) {
          precedingLogLine = lines[scan];
          precedingIsError = errorLevelPattern.test(lines[scan]);
          break;
        }
      }
      // If the nearest timestamped line exists and is not an error level, skip.
      if (precedingLogLine && !precedingIsError) {
        continue;
      }

      const blockLines: string[] = [lines[index]];
      // In swirlds/hgcaa logs, the actual throwable class line can follow a
      // timestamped ERROR marker line. Include that marker line as context.
      if (
        index > 0 &&
        blockLines.length < maxLinesPerBlock &&
        (/\bERROR\s+EXCEPTION\b/i.test(lines[index - 1]) ||
          (timestampPattern.test(lines[index - 1]) && errorLevelPattern.test(lines[index - 1]))) &&
        !blockLines.includes(lines[index - 1])
      ) {
        blockLines.unshift(lines[index - 1]);
      }

      let next: number = index + 1;
      while (next < lines.length && blockLines.length < maxLinesPerBlock) {
        const line: string = lines[next];
        if (line.trim().length === 0 || timestampPattern.test(line)) {
          break;
        }
        if (
          /^\s+at\s+/.test(line) ||
          /^\s*Caused by:/.test(line) ||
          /^\s*Suppressed:/.test(line) ||
          /^\s*\.\.\.\s+\d+\s+more/.test(line) ||
          exceptionTypeLinePattern.test(line)
        ) {
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
      'app-error': 6,
    };
    const categoryLabel: Record<DiagnosticsFindingCategory, string> = {
      'image-pull': 'Image Pull',
      oom: 'Out Of Memory',
      'pod-readiness': 'Pod Readiness',
      'consensus-active': 'Consensus Active State',
      'log-exception': 'Exception Stack',
      'app-error': 'Application Error',
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
