// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

export class MissingActiveContextError extends SoloError {
  public static MISSING_ACTIVE_CONTEXT: string =
    'No active kubernetes context found. Please set current kubernetes context.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingActiveContextError.MISSING_ACTIVE_CONTEXT, cause, meta);
  }
}
