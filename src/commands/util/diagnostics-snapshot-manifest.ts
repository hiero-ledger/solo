// SPDX-License-Identifier: Apache-2.0

/** Describes one pod-log collection written to `hiero-components-logs/<timestamp>/manifest.json`. */
export interface DiagnosticsSnapshotManifest {
  /** ISO-8601 time the collection ran. */
  readonly collectedAt: string;
  readonly deployment?: string;
  readonly pods: ReadonlyArray<{
    readonly name: string;
    readonly namespace: string;
    readonly context: string;
    /** ISO-8601 pod creation time, when known. */
    readonly creationTimestamp?: string;
  }>;
}
