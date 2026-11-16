// SPDX-License-Identifier: Apache-2.0

/** The subset of a `solo.ndjson` line the diagnostics analyzer reads. */
export interface SoloLogEntry {
  readonly level: number;
  /** Epoch milliseconds. */
  readonly time: number;
  readonly traceId?: string;
  readonly msg?: string;
  readonly namespace?: string;
  readonly deployment?: string;
  readonly err?: {readonly message?: string; readonly stack?: string};
  readonly soloInvocation?: {readonly version?: string; readonly command?: string; readonly pid?: number};
}
