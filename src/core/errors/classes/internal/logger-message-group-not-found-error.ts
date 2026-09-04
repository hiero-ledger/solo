// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the logging subsystem is asked for a message group by a `key` that
 * was never registered. solo groups related log messages under named keys, and this is raised
 * when code references a group that does not exist — typically a typo in the key or a group
 * that was renamed or never added. It points to a defect in solo rather than to user input.
 */
export class LoggerMessageGroupNotFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(key: string) {
    super({
      message: `Logger message group with key "${key}" does not exist`,
      code: ErrorCodeRegistry.LOGGER_MESSAGE_GROUP_NOT_FOUND,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
