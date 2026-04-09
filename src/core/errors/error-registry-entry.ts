// SPDX-License-Identifier: Apache-2.0

import {type ErrorCategory} from './error-category.js';
import {type SoloErrorCode} from './solo-error-code.js';

export interface ErrorRegistryEntry {
  readonly code: SoloErrorCode;
  readonly category: ErrorCategory;
  /** Handlebars-style template: "Pod '{{pod}}' not ready in {{namespace}}" */
  readonly messageTemplate: string;
  readonly retryable: boolean;
  /** Absolute doc URL: https://solo.hiero.org/docs/errors/SOLO-XXXX */
  readonly docUrl: string;
  /** Optional shell commands shown as hints in human output */
  readonly troubleshootingSteps?: ReadonlyArray<string>;
}
