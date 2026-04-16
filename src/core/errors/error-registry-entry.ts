// SPDX-License-Identifier: Apache-2.0

import {type ErrorCategory} from './error-category.js';
import {type SoloErrorCode} from './solo-error-code.js';

export interface ErrorRegistryEntry {
  readonly code: SoloErrorCode;
  readonly category: ErrorCategory;
  /** Full locale key for the message template, e.g. "pod_not_ready_message" */
  readonly messageTemplate: string;
  readonly retryable: boolean;
  /** Absolute doc URL: https://solo.hiero.org/docs/errors/SOLO-XXXX */
  readonly docUrl: string;
  /** Full locale key for the troubleshooting steps, e.g. "pod_not_ready_troubleshooting_steps" */
  readonly troubleshootingSteps?: string;
}
