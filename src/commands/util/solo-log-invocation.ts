// SPDX-License-Identifier: Apache-2.0

import {type SoloLogEntry} from './solo-log-entry.js';

/** All `solo.ndjson` entries written by one Solo process (one `traceId`). */
export interface SoloLogInvocation {
  readonly traceId: string;
  readonly entries: SoloLogEntry[];
  /** True when the process was itself a diagnostics run. */
  diagnostics: boolean;
  /** True when the process created a deployment. */
  creation: boolean;
  command?: string;
  version?: string;
  namespace?: string;
}
