// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../src/core/constants.js';

/**
 * Captures and inspects the `solo.log` file so the one-shot idempotency E2E test can assert the
 * precise skip/run sequence of a re-run.
 *
 * The one-shot deploy orchestrator emits a `Step '<command>' skipped: <reason>` info log for every
 * idempotency guard that short-circuits a step (see {@link SKIP_REASONS}). By recording the byte
 * offset of the log before a run ({@link mark}) and reading the appended text afterwards
 * ({@link readSince}), the test can verify which guards fired during that specific run.
 */
export class OneShotIdempotencyLogCapture {
  /**
   * Distinct, stable fragments of the skip messages logged by the idempotency guards in
   * `DefaultOneShotDeployOrchestrator`. One fragment per guarded step that logs on skip.
   */
  public static readonly SKIP_REASONS: readonly string[] = [
    'cluster ref already in local config',
    'deployment already exists in local config',
    'remote config already exists',
    'pod-monitor-role already installed',
    'consensus keys already on disk',
  ];

  public static getLogFilePath(): string {
    return PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log');
  }

  /**
   * Returns the current size (in bytes) of `solo.log`, or 0 when the file does not yet exist. Use
   * the returned offset with {@link readSince} to read only the text appended by a subsequent run.
   */
  public static mark(): number {
    const logFilePath: string = OneShotIdempotencyLogCapture.getLogFilePath();
    return fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0;
  }

  /**
   * Reads the text appended to `solo.log` since the given byte offset.
   */
  public static readSince(offset: number): string {
    const logFilePath: string = OneShotIdempotencyLogCapture.getLogFilePath();
    if (!fs.existsSync(logFilePath)) {
      return '';
    }
    const buffer: Buffer = fs.readFileSync(logFilePath);
    // If the log was rotated/truncated since the offset was taken, fall back to the whole file.
    const start: number = offset <= buffer.length ? offset : 0;
    return buffer.toString('utf8', start);
  }

  /**
   * Counts how many of the {@link SKIP_REASONS} appear in the supplied log text. On a fresh deploy
   * this is 0 (every guard is inactive); after a fully successful deploy a re-run trips all guards.
   */
  public static countSkippedSteps(logContent: string): number {
    return OneShotIdempotencyLogCapture.SKIP_REASONS.filter((reason: string): boolean => logContent.includes(reason))
      .length;
  }
}
