// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class MissingParentResourceReferenceError extends KubeError {
  public static MISSING_PARENT_RESOURCE_REF: string = 'The parent ResourceReference is required.';

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
