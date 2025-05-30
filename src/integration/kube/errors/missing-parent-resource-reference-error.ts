// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

export class MissingParentResourceReferenceError extends SoloError {
  public static MISSING_PARENT_RESOURCE_REF = 'The parent ResourceReference is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingParentResourceReferenceError.MISSING_PARENT_RESOURCE_REF, cause, meta);
  }
}
